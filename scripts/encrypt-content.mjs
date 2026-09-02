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

async function readOptionalJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function validateReactions(reactions, readerIds, filePath) {
  if (!reactions || !Array.isArray(reactions.comments)) {
    throw new Error(`Comments file must contain a comments array: ${filePath}`);
  }

  const visit = (comments) => comments.forEach((comment) => {
    if (!readerIds.has(comment.readerId)) {
      throw new Error(`Unknown reader "${comment.readerId}" in ${filePath}`);
    }
    visit(comment.replies || []);
  });
  visit(reactions.comments);
  return reactions;
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

async function loadBook(directoryName) {
  const directory = join(sourceDir, directoryName);
  const metadata = JSON.parse(await readFile(join(directory, 'book.json'), 'utf8'));
  const readers = await readOptionalJson(join(directory, 'readers.json'), []);
  const readerIds = new Set(readers.map((reader) => reader.id));
  const chapterFiles = (await readdir(directory))
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!chapterFiles.length) throw new Error(`No Markdown chapters found in ${directory}`);

  const chapters = await Promise.all(chapterFiles.map(async (fileName) => {
    const chapter = parseChapter(await readFile(join(directory, fileName), 'utf8'), fileName);
    const commentsPath = join(directory, `${basename(fileName, '.md')}.comments.json`);
    const reactions = await readOptionalJson(commentsPath, null);
    return {
      ...chapter,
      reactions: reactions ? validateReactions(reactions, readerIds, commentsPath) : null,
    };
  }));

  return {
    id: metadata.id || directoryName,
    title: metadata.title,
    kind: metadata.kind || 'A private novel',
    description: metadata.description || '',
    color: metadata.color || '#243b2b',
    symbol: metadata.symbol || '✦',
    readers,
    chapters,
  };
}

const password = process.env.LIBRARY_PASSWORD || await readHidden('Library password (hidden): ');
if (password.length < 10) throw new Error('Use a password with at least 10 characters.');

const sourceEntries = await readdir(sourceDir, { withFileTypes: true });
const bookDirectories = sourceEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!bookDirectories.length) {
  throw new Error(`No book folders found in ${sourceDir}. Each book needs its own folder and book.json file.`);
}

const books = await Promise.all(bookDirectories.map(loadBook));
const plaintext = JSON.stringify({ title: 'The Girl in the Library', books });
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();

const payload = {
  version: 2,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: salt.toString('base64') },
  cipher: { name: 'AES-GCM', iv: iv.toString('base64'), tagLength: 128 },
  data: Buffer.concat([ciphertext, authTag]).toString('base64'),
};

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Encrypted ${books.length} book(s) and ${books.reduce((total, book) => total + book.chapters.length, 0)} chapter(s).`);
