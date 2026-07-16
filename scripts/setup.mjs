import { access, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
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
    const secret = () => randomBytes(36).toString('base64url');
    await writeFile(
      destination,
      `NODE_ENV=development\nDEPLOYMENT_MODE=local\nHOST=127.0.0.1\nPORT=4317\nPUBLIC_BASE_URL=http://127.0.0.1:4317\nDATABASE_URL=file:./data/meetwise.db\nDATABASE_BUSY_TIMEOUT_MS=15000\nSESSION_SECRET=${secret()}\nTOKEN_SIGNING_SECRET=${secret()}\nOLLAMA_URL=http://127.0.0.1:11434\nOLLAMA_MODEL=${model}\nTRUST_PROXY=false\n`
    );
    console.log('Created a local-development .env with random development secrets');
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

if (Number(process.versions.node.split('.')[0]) < 22) {
  throw new Error(`Node.js 22+ is required; found ${process.version}`);
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

const npmCommand = process.env.npm_execpath
  ? [process.execPath, [process.env.npm_execpath]]
  : ['npm', []];
const runNpm = (args) =>
  run(npmCommand[0], [...npmCommand[1], ...args], { shell: os.platform() === 'win32' });
runNpm(['run', 'db:migrate']);
for (const script of ['format:check', 'lint', 'typecheck', 'test', 'build', 'build:extension'])
  runNpm(['run', script]);

console.log('\nMeetwise Local is ready.');
console.log(
  '1. Create the initial admin with MEETWISE_ADMIN_EMAIL and MEETWISE_ADMIN_PASSWORD npm run admin:create'
);
console.log('2. Run: npm run dev');
console.log('3. Open: http://127.0.0.1:4317');
console.log('4. Load dist-extension/ from chrome://extensions');
