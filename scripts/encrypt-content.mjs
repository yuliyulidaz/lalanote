import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'private-content');
const outputFile = join(root, 'public', 'encrypted', 'library.json');
const iterations = 600_000;

function parseChapter(markdown, fileName) {
  let body = markdown;
  let title = basename(fileName, '.md').replaceAll('-', ' ');
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

  if (frontmatter) {
    body = markdown.slice(frontmatter[0].length);
    const titleLine = frontmatter[1].match(/^title:\s*(.+)$/m);
    if (titleLine) title = titleLine[1].trim().replace(/^['"]|['"]$/g, '');
  }

  return { title, html: marked.parse(body) };
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error('Run this command in a terminal, or set LIBRARY_PASSWORD for automated use.');
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  return new Promise((resolvePassword, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      resolvePassword(value);
    };

    process.stdin.on('data', (key) => {
      if (key === '\u0003') {
        process.stdin.setRawMode(false);
        reject(new Error('Cancelled.'));
      } else if (key === '\r' || key === '\n') {
        finish();
      } else if (key === '\u007f' || key === '\b') {
        value = value.slice(0, -1);
      } else {
        value += key;
      }
    });
  });
}

const password = process.env.LIBRARY_PASSWORD || await readHidden('Library password (hidden): ');
if (password.length < 10) throw new Error('Use a password with at least 10 characters.');

const files = (await readdir(sourceDir))
  .filter((name) => name.toLowerCase().endsWith('.md'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!files.length) throw new Error(`No Markdown chapters found in ${sourceDir}`);

const chapters = await Promise.all(
  files.map(async (fileName) => parseChapter(await readFile(join(sourceDir, fileName), 'utf8'), fileName)),
);

const plaintext = JSON.stringify({ title: 'The Girl in the Library', chapters });
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();

const payload = {
  version: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: salt.toString('base64') },
  cipher: { name: 'AES-GCM', iv: iv.toString('base64'), tagLength: 128 },
  data: Buffer.concat([ciphertext, authTag]).toString('base64'),
};

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Encrypted ${chapters.length} chapter(s) to public/encrypted/library.json`);

