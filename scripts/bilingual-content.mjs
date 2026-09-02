import { createHash } from 'node:crypto';

export const contentHash = (html) => createHash('sha256').update(html).digest('hex');

function plainText(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (entity, name) => {
    if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name] ?? entity;
  });
}

export function validateKoreanTranslation(data, html) {
  const count = [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].length;
  if (!data || data.sourceHash !== contentHash(html)) throw new Error('Translation does not match the current English manuscript. Re-import it.');
  if (!Array.isArray(data.paragraphs) || data.paragraphs.length !== count ||
      !data.paragraphs.every((text) => typeof text === 'string' && text.trim())) {
    throw new Error('Every English paragraph must have one non-empty Korean translation.');
  }
  if (data.title !== undefined && typeof data.title !== 'string') throw new Error('Invalid translated title.');
  return { title: data.title || '', paragraphs: data.paragraphs };
}

export function importBilingualText(text, html, expectedTitle) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^# Chapter /i.test(lines.shift() || '') || lines.shift() !== `# ${expectedTitle}`) {
    throw new Error('Bilingual chapter heading does not match the English chapter.');
  }
  const translatedTitle = lines.shift()?.match(/^<small>(.*?)<\/small>$/)?.[1];
  if (!translatedTitle) throw new Error('Missing translated chapter title.');
  const english = [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((match) => plainText(match[1]));
  const paragraphs = [];
  let sceneBreaks = 0;
  for (let index = 0; index < lines.length; index++) {
    if (/^\*\s+\*\s+\*$/.test(lines[index])) { sceneBreaks++; continue; }
    const original = lines[index].match(/^\*\*(.+)\*\*$/)?.[1];
    const translation = lines[++index]?.match(/^<small>(.*?)<\/small>$/)?.[1];
    if (!original || !translation || original !== english[paragraphs.length]) {
      throw new Error(`Bilingual paragraph ${paragraphs.length + 1} is missing, reordered, or differs from the English source.`);
    }
    paragraphs.push(translation);
  }
  if (sceneBreaks !== (html.match(/<hr\s*\/?\s*>/g) || []).length) throw new Error('Scene-break count differs from the English source.');
  const data = { sourceHash: contentHash(html), title: translatedTitle, paragraphs };
  validateKoreanTranslation(data, html);
  return data;
}
