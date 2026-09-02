import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';
import { importBilingualText, validateKoreanTranslation } from './bilingual-content.mjs';

const html = '<p>A &amp; B.</p>\n<hr>\n<p>Second paragraph.</p>\n';
const sample = '# Chapter One\n# Example\n<small>예시</small>\n\n**A & B.**\n<small>첫 문단.</small>\n\n* * *\n\n**Second paragraph.**\n<small>두 번째 문단.</small>\n';

test('pairs all paragraphs and binds translations to the unchanged English HTML', () => {
  const data = importBilingualText(sample, html, 'Example');
  assert.deepEqual(validateKoreanTranslation(data, html).paragraphs, ['첫 문단.', '두 번째 문단.']);
  assert.throws(() => validateKoreanTranslation(data, html + ' '), /does not match/);
  assert.throws(() => importBilingualText(sample.replace('Second paragraph.', 'Changed.'), html, 'Example'), /differs/);
  assert.throws(() => importBilingualText(sample.replace('**Second paragraph.**\n<small>두 번째 문단.</small>', ''), html, 'Example'), /Every English/);
  assert.throws(() => importBilingualText(sample.replace('* * *', ''), html, 'Example'), /Scene-break/);
  assert.throws(() => importBilingualText(sample, html, 'Different title'), /heading/);
});

test('translation text stays literal data rather than becoming executable HTML', () => {
  const data = importBilingualText(sample.replace('첫 문단.', '<img src=x onerror=alert(1)>'), html, 'Example');
  assert.equal(data.paragraphs[0], '<img src=x onerror=alert(1)>');
});

function element() {
  return { hidden: false, disabled: false, textContent: '', dataset: {}, attributes: {},
    classList: { add() {} }, setAttribute(name, value) { this.attributes[name] = value; },
    getBoundingClientRect() { return { top: 0, bottom: 0 }; }, after() {} };
}

test('E/K visibility, same-node English, anchor retention, and chapter reset', async () => {
  const source = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  const start = source.indexOf('      function setReadingMode(');
  const end = source.indexOf('      function showChapter(', start);
  const code = (await transform(source.slice(start, end), { loader: 'ts' })).code;
  let pageOffset = 0;
  const translations = [];
  const originals = [element(), element()];
  originals.forEach((paragraph, index) => {
    paragraph.textContent = `Unchanged English ${index}`;
    paragraph.after = (translation) => {
      translations[index] = translation;
      translation.getBoundingClientRect = () => ({ top: paragraph.getBoundingClientRect().bottom, bottom: paragraph.getBoundingClientRect().bottom + 80 });
    };
    paragraph.getBoundingClientRect = () => {
      const shownBefore = translations.slice(0, index).filter((item) => !item.hidden).length;
      const top = 100 + index * 120 + shownBefore * 80 - pageOffset;
      return { top, bottom: top + 70 };
    };
  });
  const context = { reader: { hidden: false }, languageSwitch: element(), englishMode: element(), koreanMode: element(),
    translatedTitle: element(), chapterBody: { dataset: {}, querySelectorAll: () => originals },
    englishParagraphs: [], koreanParagraphs: [], document: { createElement: element, querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 56 }) }) },
    window: { scrollBy: ({ top }) => { pageOffset += top; } } };
  vm.createContext(context);
  vm.runInContext(code, context);
  const chapter = { korean: { title: '예시', paragraphs: ['첫 번역', '<script>literal</script>'] } };
  context.prepareReadingLanguage(chapter);
  assert.equal(context.languageSwitch.hidden, false);
  assert.equal(context.koreanMode.disabled, false);
  assert(translations.every((item) => item.hidden && item.lang === 'ko'));
  assert.equal(context.translatedTitle.hidden, true);
  assert.equal(translations[1].textContent, '<script>literal</script>');
  assert.equal(pageOffset, 0);

  // The second paragraph is being read below the floating controls.
  pageOffset = 150;
  const before = originals[1].getBoundingClientRect().top;
  context.setReadingMode('bilingual');
  assert(translations.every((item) => !item.hidden));
  assert.equal(originals[1].getBoundingClientRect().top, before);
  assert.equal(context.koreanMode.attributes['aria-pressed'], 'true');
  assert.equal(context.translatedTitle.hidden, false);
  context.setReadingMode('english');
  assert.equal(originals[1].getBoundingClientRect().top, before);
  assert(translations.every((item) => item.hidden));
  assert.equal(originals[1].textContent, 'Unchanged English 1');

  context.setReadingMode('bilingual');
  pageOffset = 290; // Reading the Korean half of paragraph two.
  context.setReadingMode('english');
  assert.equal(originals[1].getBoundingClientRect().top, 80);
  context.prepareReadingLanguage({});
  assert.equal(context.languageSwitch.hidden, true);
  assert.equal(context.koreanMode.disabled, true);
  assert.equal(context.translatedTitle.textContent, '');
  assert.equal(context.chapterBody.dataset.readingMode, 'english');
  context.setReadingMode('bilingual');
  assert.equal(context.chapterBody.dataset.readingMode, 'english');
  context.prepareReadingLanguage({ korean: { paragraphs: ['Incomplete'] } });
  assert.equal(context.languageSwitch.hidden, true);
});
