import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const production =
  process.argv.includes('--package') || process.env.EXTENSION_BUILD_MODE === 'production';
const configured = process.env.EXTENSION_SERVER_URL;
if (production && !configured)
  throw new Error('EXTENSION_SERVER_URL is required for production extension packages');
const rawUrl = configured || 'http://127.0.0.1:4317';
const url = new URL(rawUrl);
if (
  !['http:', 'https:'].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  (url.pathname !== '/' && url.pathname !== '')
) {
  throw new Error(
    'EXTENSION_SERVER_URL must be a credential-free http(s) origin without path, query, or fragment'
  );
}
if (production && url.protocol !== 'https:')
  throw new Error('Production extension packages require an HTTPS EXTENSION_SERVER_URL');
const out = path.join(root, 'dist-extension');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of [
  'background.js',
  'content.js',
  'lib.js',
  'popup.html',
  'popup.js',
  'popup.css'
]) {
  await cp(path.join(root, 'extension', name), path.join(out, name));
}
await cp(path.join(root, 'extension', 'assets'), path.join(out, 'assets'), { recursive: true });
const manifest = (await readFile(path.join(root, 'extension', 'manifest.template.json'), 'utf8'))
  .replace('__VERSION__', pkg.version)
  .replace('__SERVER_ORIGIN__', url.origin);
await writeFile(path.join(out, 'manifest.json'), manifest);
await writeFile(
  path.join(out, 'config.js'),
  `export const BUILD_MODE = ${JSON.stringify(production ? 'production' : 'development')};\nexport const DEFAULT_SERVER_URL = ${JSON.stringify(url.origin)};\n`
);

if (process.argv.includes('--package')) {
  await mkdir(path.join(root, 'release'), { recursive: true });
  const target = path.join(root, 'release', `meetwise-extension-v${pkg.version}.zip`);
  await new Promise((resolve, reject) => {
    const output = createWriteStream(target);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(out, false);
    void archive.finalize();
  });
  process.stdout.write(`${target}\n`);
} else process.stdout.write(`${out}\n`);
