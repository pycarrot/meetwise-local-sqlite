import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { AnalysisOutput } from '../../packages/shared/schemas.js';

const uuidDefault = sql`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`;
const nowMs = sql`(unixepoch('subsec') * 1000)`;
const id = () => text('id').primaryKey().notNull().default(uuidDefault);
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowMs);
const updatedAt = () => integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(nowMs);

export const users = sqliteTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status', { enum: ['active', 'disabled'] })
      .notNull()
      .default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${table.email})`)]
);

export const workspaces = sqliteTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('workspace_members_workspace_user_uq').on(table.workspaceId, table.userId),
    index('workspace_members_user_idx').on(table.userId),
    index('workspace_members_workspace_idx').on(table.workspaceId)
  ]
);

export const meetings = sqliteTable(
  'meetings',
  {
    id: id(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    source: text('source').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index('meetings_workspace_started_idx').on(table.workspaceId, table.startedAt),
    index('meetings_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('meetings_created_by_idx').on(table.createdBy)
  ]
);

export const transcriptSegments = sqliteTable(
  'transcript_segments',
  {
    id: id(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    position: integer('position').notNull(),
    speaker: text('speaker').notNull(),
    text: text('text').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('transcript_segments_meeting_position_uq').on(table.meetingId, table.position),
    index('transcript_segments_meeting_idx').on(table.meetingId),
    index('transcript_segments_speaker_idx').on(table.speaker)
  ]
);

export const analyses = sqliteTable(
  'analyses',
  {
    id: id(),
    meetingId: text('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] })
      .notNull()
      .default('pending'),
    model: text('model'),
    result: text('result', { mode: 'json' }).$type<AnalysisOutput>(),
    failureReason: text('failure_reason'),
    attemptCount: integer('attempt_count').notNull().default(0),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex('analyses_meeting_uq').on(table.meetingId),
    index('analyses_status_idx').on(table.status)
  ]
);

export const decisions = sqliteTable(
  'decisions',
  {
    id: id(),
    analysisId: text('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    createdAt: createdAt()
  },
  (table) => [index('decisions_analysis_idx').on(table.analysisId)]
);

export const actionItems = sqliteTable(
  'action_items',
  {
    id: id(),
    analysisId: text('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    owner: text('owner').notNull(),
    task: text('task').notNull(),
    due: text('due').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt()
  },
  (table) => [index('action_items_analysis_idx').on(table.analysisId)]
);

export const webSessions = sqliteTable(
  'web_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    csrfHash: text('csrf_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('web_sessions_token_hash_uq').on(table.tokenHash),
    index('web_sessions_user_idx').on(table.userId),
    index('web_sessions_expires_idx').on(table.expiresAt)
  ]
);

export const extensionSessions = sqliteTable(
  'extension_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    refreshExpiresAt: integer('refresh_expires_at', { mode: 'timestamp_ms' }).notNull(),
    accessVersion: integer('access_version').notNull().default(1),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('extension_sessions_refresh_hash_uq').on(table.refreshTokenHash),
    index('extension_sessions_user_idx').on(table.userId),
    index('extension_sessions_workspace_idx').on(table.workspaceId)
  ]
);

export const ingestionKeys = sqliteTable(
  'ingestion_keys',
  {
    id: id(),
    extensionSessionId: text('extension_session_id')
      .notNull()
      .references(() => extensionSessions.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    meetingId: text('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('ingestion_keys_session_key_uq').on(table.extensionSessionId, table.key),
    index('ingestion_keys_created_idx').on(table.createdAt)
  ]
);

export const analysisJobs = sqliteTable(
  'analysis_jobs',
  {
    id: id(),
    analysisId: text('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] })
      .notNull()
      .default('pending'),
    runAfter: integer('run_after', { mode: 'timestamp_ms' }).notNull().default(nowMs),
    lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
    lockedBy: text('locked_by'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    index('analysis_jobs_claim_idx').on(table.status, table.runAfter),
    index('analysis_jobs_analysis_idx').on(table.analysisId),
    uniqueIndex('analysis_jobs_active_uq')
      .on(table.analysisId)
      .where(sql`${table.status} in ('pending', 'running')`)
  ]
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: id(),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    success: integer('success', { mode: 'boolean' }).notNull(),
    ipHash: text('ip_hash'),
    metadata: text('metadata', { mode: 'json' })
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: createdAt()
  },
  (table) => [
    index('audit_logs_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('audit_logs_actor_created_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_action_idx').on(table.action)
  ]
);
