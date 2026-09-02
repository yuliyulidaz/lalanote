import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const forbidden = [
  'This is a test chapter',
  'At five minutes to closing',
  'A PAGE TURNED IN AN EMPTY LIBRARY',
  'The building has opinions',
];

// Derive private manuscript checks locally; never commit real excerpts here.
const privateRoot = join(root, 'private-content');
let privateEntries = [];
try {
  privateEntries = await readdir(privateRoot, { withFileTypes: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let manuscriptCount = 0;
for (const entry of privateEntries.filter((entry) => entry.isDirectory())) {
  const directory = join(privateRoot, entry.name);
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.ko.json'))) {
    const translation = JSON.parse(await readFile(join(directory, name), 'utf8'));
    forbidden.push(...translation.paragraphs.filter((text) => text.length >= 15));
  }
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.md'))) {
    manuscriptCount += 1;
    const markdown = await readFile(join(directory, name), 'utf8');
    const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    for (const line of body.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length >= 50)) {
      forbidden.push(line, line.replace(/\\([\\`*_{}\[\]()#+.!|\-])/g, '$1'));
    }
  }
}
const phrases = [...new Set(forbidden)];

async function filesUnder(directory) {
  const entries = await readdir(directory);
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry);
    return (await stat(path)).isDirectory() ? filesUnder(path) : [path];
  }));
  return nested.flat();
}

for (const file of await filesUnder(dist)) {
  const content = await readFile(file, 'utf8').catch(() => '');
  for (const phrase of phrases) {
    if (content.includes(phrase)) throw new Error(`Plaintext leaked into build: ${file}`);
  }
}

console.log(`Privacy check passed: ${manuscriptCount} local manuscript(s) and test content checked against dist/.`);
