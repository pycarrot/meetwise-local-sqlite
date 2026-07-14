import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const manifest = JSON.parse(
  await readFile(path.join(rootDir, 'extension', 'manifest.json'), 'utf8')
);

if (manifest.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: package.json=${packageJson.version}, extension/manifest.json=${manifest.version}`
  );
}

const releaseDir = path.join(rootDir, 'release');
await mkdir(releaseDir, { recursive: true });
const outputPath = path.join(releaseDir, `meetwise-local-extension-v${manifest.version}.zip`);

await new Promise((resolve, reject) => {
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') console.warn(error.message);
    else reject(error);
  });
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(path.join(rootDir, 'extension'), false);
  archive.finalize();
});

console.log(`Extension package: ${outputPath}`);
