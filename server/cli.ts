import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from './config.js';
import { hashPassword } from './auth/crypto.js';
import { closeDatabase, db } from './db/client.js';
import { migrate, migrationStatus } from './db/migrate.js';
import { meetings, transcriptSegments, users, workspaceMembers, workspaces } from './db/schema.js';
import { meetingIngestionSchema, passwordSchema, uuidSchema } from '../packages/shared/schemas.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function createAdmin(seed = false): Promise<void> {
  const email = (flag('email') ?? process.env.MEETWISE_ADMIN_EMAIL)?.trim().toLowerCase();
  const displayName = (
    flag('name') ??
    process.env.MEETWISE_ADMIN_NAME ??
    'Meetwise Administrator'
  ).trim();
  const workspaceName = (
    flag('workspace') ??
    process.env.MEETWISE_ADMIN_WORKSPACE ??
    'Default workspace'
  ).trim();
  const password = seed
    ? randomBytes(24).toString('base64url')
    : process.env.MEETWISE_ADMIN_PASSWORD;
  if (!email || !z.string().email().safeParse(email).success)
    throw new Error('Provide a valid --email or MEETWISE_ADMIN_EMAIL');
  if (!password)
    throw new Error(
      'Set MEETWISE_ADMIN_PASSWORD; passwords are intentionally not accepted as command-line arguments'
    );
  passwordSchema.parse(password);
  const passwordHash = await hashPassword(password);
  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length) throw new Error('An account with this email already exists');
    const [user] = await tx.insert(users).values({ email, displayName, passwordHash }).returning();
    if (!user) throw new Error('Failed to create administrator');
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: workspaceName, createdBy: user.id })
      .returning();
    if (!workspace) throw new Error('Failed to create workspace');
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
    return { userId: user.id, workspaceId: workspace.id };
  });
  process.stdout.write(`${JSON.stringify({ created: true, email, ...result })}\n`);
  if (seed) process.stdout.write(`Development password: ${password}\n`);
}

async function createUser(): Promise<void> {
  const email = (flag('email') ?? process.env.MEETWISE_USER_EMAIL)?.trim().toLowerCase();
  const displayName = (flag('name') ?? process.env.MEETWISE_USER_NAME)?.trim();
  const password = process.env.MEETWISE_USER_PASSWORD;
  if (!email || !z.string().email().safeParse(email).success)
    throw new Error('Provide a valid --email or MEETWISE_USER_EMAIL');
  if (!displayName) throw new Error('Provide --name or MEETWISE_USER_NAME');
  if (!password)
    throw new Error(
      'Set MEETWISE_USER_PASSWORD; passwords are intentionally not accepted as command-line arguments'
    );
  passwordSchema.parse(password);
  const [user] = await db
    .insert(users)
    .values({ email, displayName, passwordHash: await hashPassword(password) })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!user) throw new Error('An account with this email already exists');
  process.stdout.write(`${JSON.stringify({ created: true, userId: user.id, email })}\n`);
}

const legacySegment = z.object({
  id: z.string().optional(),
  speaker: z.string(),
  text: z.string(),
  startMs: z.number(),
  endMs: z.number()
});
const legacyMeeting = z.object({
  title: z.string(),
  source: z.string().optional(),
  startedAt: z.string(),
  endedAt: z.string(),
  segments: z.array(legacySegment)
});
const legacyFile = z.union([
  z.array(legacyMeeting),
  z.object({ meetings: z.array(legacyMeeting) })
]);

async function importLegacy(): Promise<void> {
  const file = flag('file');
  const workspaceId = uuidSchema.parse(flag('workspace'));
  if (!file)
    throw new Error(
      'Usage: npm run import:legacy -- --file ./data/meetings.json --workspace <uuid>'
    );
  const raw = legacyFile.parse(JSON.parse(await readFile(file, 'utf8')));
  const items = Array.isArray(raw) ? raw : raw.meetings;
  const [owner] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')))
    .limit(1);
  if (!owner) throw new Error('Workspace does not exist or has no owner');
  let imported = 0;
  for (const item of items) {
    const payload = meetingIngestionSchema.parse({
      ...item,
      source: 'google-meet-caption',
      segments: item.segments.map((segment) => ({ ...segment, clientId: segment.id }))
    });
    await db.transaction(async (tx) => {
      const [meeting] = await tx
        .insert(meetings)
        .values({
          workspaceId,
          createdBy: owner.userId,
          title: payload.title,
          source: 'legacy-import',
          startedAt: new Date(payload.startedAt),
          endedAt: new Date(payload.endedAt)
        })
        .returning();
      if (!meeting) throw new Error('Failed to import meeting');
      await tx.insert(transcriptSegments).values(
        payload.segments.map((segment, position) => ({
          meetingId: meeting.id,
          clientId: segment.clientId,
          position,
          speaker: segment.speaker,
          text: segment.text,
          startMs: segment.startMs,
          endMs: segment.endMs
        }))
      );
    });
    imported += 1;
  }
  process.stdout.write(`${JSON.stringify({ imported, workspaceId })}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'db:migrate')
    process.stdout.write(`${JSON.stringify({ applied: await migrate() })}\n`);
  else if (command === 'db:status')
    process.stdout.write(`${JSON.stringify(await migrationStatus(), null, 2)}\n`);
  else if (command === 'admin:create') await createAdmin();
  else if (command === 'user:create') await createUser();
  else if (command === 'db:seed') {
    if (config.nodeEnv === 'production') throw new Error('db:seed is disabled in production');
    await createAdmin(true);
  } else if (command === 'import:legacy') await importLegacy();
  else
    throw new Error(
      'Unknown command. Use db:migrate, db:status, db:seed, admin:create, user:create, or import:legacy'
    );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
