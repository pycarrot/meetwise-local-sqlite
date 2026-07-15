import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import type { AnalysisOutput } from '../../packages/shared/schemas.js';

export const accountStatus = pgEnum('account_status', ['active', 'disabled']);
export const workspaceRole = pgEnum('workspace_role', ['owner', 'admin', 'member', 'viewer']);
export const analysisStatus = pgEnum('analysis_status', [
  'pending',
  'running',
  'completed',
  'failed'
]);
export const jobStatus = pgEnum('job_status', ['pending', 'running', 'completed', 'failed']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    status: accountStatus('status').notNull().default('active'),
    ...timestamps
  },
  (table) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${table.email})`)]
);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  ...timestamps
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex('workspace_members_workspace_user_uq').on(table.workspaceId, table.userId),
    index('workspace_members_user_idx').on(table.userId),
    index('workspace_members_workspace_idx').on(table.workspaceId)
  ]
);

export const meetings = pgTable(
  'meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    source: text('source').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index('meetings_workspace_started_idx').on(table.workspaceId, table.startedAt),
    index('meetings_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('meetings_created_by_idx').on(table.createdBy)
  ]
);

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    position: integer('position').notNull(),
    speaker: text('speaker').notNull(),
    text: text('text').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('transcript_segments_meeting_position_uq').on(table.meetingId, table.position),
    index('transcript_segments_meeting_idx').on(table.meetingId),
    index('transcript_segments_speaker_idx').on(table.speaker),
    index('transcript_segments_search_idx').using('gin', sql`to_tsvector('simple', ${table.text})`)
  ]
);

export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    status: analysisStatus('status').notNull().default('pending'),
    model: text('model'),
    result: jsonb('result').$type<AnalysisOutput>(),
    failureReason: text('failure_reason'),
    attemptCount: integer('attempt_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex('analyses_meeting_uq').on(table.meetingId),
    index('analyses_status_idx').on(table.status)
  ]
);

export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('decisions_analysis_idx').on(table.analysisId)]
);

export const actionItems = pgTable(
  'action_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    owner: text('owner').notNull(),
    task: text('task').notNull(),
    due: text('due').notNull(),
    completed: boolean('completed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('action_items_analysis_idx').on(table.analysisId)]
);

export const webSessions = pgTable(
  'web_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    csrfHash: text('csrf_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('web_sessions_token_hash_uq').on(table.tokenHash),
    index('web_sessions_user_idx').on(table.userId),
    index('web_sessions_expires_idx').on(table.expiresAt)
  ]
);

export const extensionSessions = pgTable(
  'extension_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }).notNull(),
    accessVersion: integer('access_version').notNull().default(1),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('extension_sessions_refresh_hash_uq').on(table.refreshTokenHash),
    index('extension_sessions_user_idx').on(table.userId),
    index('extension_sessions_workspace_idx').on(table.workspaceId)
  ]
);

export const ingestionKeys = pgTable(
  'ingestion_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    extensionSessionId: uuid('extension_session_id')
      .notNull()
      .references(() => extensionSessions.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    meetingId: uuid('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('ingestion_keys_session_key_uq').on(table.extensionSessionId, table.key),
    index('ingestion_keys_created_idx').on(table.createdAt)
  ]
);

export const analysisJobs = pgTable(
  'analysis_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: jobStatus('status').notNull().default('pending'),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('analysis_jobs_claim_idx').on(table.status, table.runAfter),
    index('analysis_jobs_analysis_idx').on(table.analysisId),
    uniqueIndex('analysis_jobs_active_uq')
      .on(table.analysisId)
      .where(sql`${table.status} in ('pending', 'running')`)
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    success: boolean('success').notNull(),
    ipHash: text('ip_hash'),
    metadata: jsonb('metadata')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('audit_logs_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('audit_logs_actor_created_idx').on(table.actorUserId, table.createdAt),
    index('audit_logs_action_idx').on(table.action)
  ]
);
