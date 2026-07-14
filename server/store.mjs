import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMeeting } from './stats.mjs';
import { seedMeeting } from './seed.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(rootDir, 'data');
const databasePath = path.join(dataDir, 'meetings.json');
let writeQueue = Promise.resolve();

function enqueueWrite(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => undefined);
  return next;
}

async function readDatabase() {
  await mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(databasePath, 'utf8'));
    return Array.isArray(parsed.meetings) ? parsed : { version: 1, meetings: [] };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const seeded = { version: 1, meetings: [normalizeMeeting(seedMeeting)] };
    await writeDatabase(seeded);
    return seeded;
  }
}

async function writeDatabase(database) {
  await mkdir(dataDir, { recursive: true });
  const tempPath = `${databasePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  await rename(tempPath, databasePath);
}

export async function listMeetings() {
  const { meetings } = await readDatabase();
  return meetings
    .map(({ segments, ...meeting }) => ({ ...meeting, segmentCount: segments.length }))
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

export async function getMeeting(id) {
  const { meetings } = await readDatabase();
  return meetings.find((meeting) => meeting.id === id) || null;
}

export async function saveMeeting(input) {
  return enqueueWrite(async () => {
    const database = await readDatabase();
    const existingIndex = input.id
      ? database.meetings.findIndex((meeting) => meeting.id === input.id)
      : -1;
    const normalized = normalizeMeeting(
      existingIndex >= 0 ? { ...database.meetings[existingIndex], ...input } : input
    );
    if (existingIndex >= 0) database.meetings[existingIndex] = normalized;
    else database.meetings.push(normalized);
    await writeDatabase({ version: 1, meetings: database.meetings });
    return normalized;
  });
}

export async function saveAnalysis(id, analysis) {
  const meeting = await getMeeting(id);
  if (!meeting) return null;
  return saveMeeting({ ...meeting, analysis });
}
