import { access, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = process.env.OLLAMA_MODEL || 'llama3.2';
const skipModel = process.argv.includes('--skip-model');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

async function ensureEnvironmentFile() {
  const destination = path.join(rootDir, '.env');
  try {
    await access(destination);
  } catch {
    await copyFile(path.join(rootDir, '.env.example'), destination);
    console.log('Created .env from .env.example');
  }
}

function findOllama() {
  if (process.env.OLLAMA_BIN) return process.env.OLLAMA_BIN;
  const command = os.platform() === 'win32' ? 'where.exe' : 'which';
  const lookup = spawnSync(command, ['ollama'], { encoding: 'utf8' });
  if (lookup.status === 0) return lookup.stdout.trim().split(/\r?\n/)[0];
  if (os.platform() === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe');
  }
  return 'ollama';
}

if (Number(process.versions.node.split('.')[0]) < 20) {
  throw new Error(`Node.js 20+ is required; found ${process.version}`);
}

await ensureEnvironmentFile();

if (!skipModel) {
  const ollama = findOllama();
  const versionCheck = spawnSync(ollama, ['--version'], { stdio: 'inherit' });
  if (versionCheck.status !== 0) {
    console.error('\nOllama was not found. Install it from https://ollama.com/download and rerun:');
    console.error('  npm run setup\n');
    process.exit(1);
  }
  console.log(`Ensuring Ollama model is available: ${model}`);
  run(ollama, ['pull', model]);
}

if (process.env.npm_execpath) {
  run(process.execPath, [process.env.npm_execpath, 'run', 'check']);
} else {
  run('npm', ['run', 'check'], { shell: os.platform() === 'win32' });
}

console.log('\nMeetwise Local is ready.');
console.log('1. Run: npm start');
console.log('2. Open: http://127.0.0.1:4317');
console.log('3. Load the extension/ folder from chrome://extensions');
