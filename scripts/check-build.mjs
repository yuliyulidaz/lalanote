import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const dist = join(root, 'dist');
const forbidden = ['This is a test chapter', 'At five minutes to closing'];

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
  for (const phrase of forbidden) {
    if (content.includes(phrase)) throw new Error(`Plaintext leaked into build: ${file}`);
  }
}

console.log('Privacy check passed: test manuscript text is absent from dist/.');

