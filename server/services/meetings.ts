import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, like, lt, or, sql } from 'drizzle-orm';
import type { MeetingIngestion } from '../../packages/shared/schemas.js';
import { db } from '../db/client.js';
import { analyses, ingestionKeys, meetings, transcriptSegments } from '../db/schema.js';
import { ApiError } from '../http/errors.js';
import { calculateSpeakerStats } from './stats.js';

export function hashIngestionPayload(payload: MeetingIngestion): string {
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('base64url');
}

export async function ingestMeeting(input: {
  payload: MeetingIngestion;
  userId: string;
  workspaceId: string;
  extensionSessionId: string;
  idempotencyKey: string;
}) {
  const requestHash = hashIngestionPayload(input.payload);
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ requestHash: ingestionKeys.requestHash, meetingId: ingestionKeys.meetingId })
        .from(ingestionKeys)
        .where(
          and(
            eq(ingestionKeys.extensionSessionId, input.extensionSessionId),
            eq(ingestionKeys.key, input.idempotencyKey)
          )
        )
        .limit(1);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ApiError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was reused for a different request'
          );
        if (!existing.meetingId)
          throw new ApiError(
            409,
            'INGESTION_IN_PROGRESS',
            'The original ingestion is still in progress'
          );
        const meeting = await getMeeting(input.workspaceId, existing.meetingId);
        if (!meeting)
          throw new ApiError(
            409,
            'IDEMPOTENCY_STATE_INVALID',
            'Stored ingestion result is unavailable'
          );
        return { meeting, replayed: true };
      }
      const [keyRow] = await tx
        .insert(ingestionKeys)
        .values({
          extensionSessionId: input.extensionSessionId,
          workspaceId: input.workspaceId,
          key: input.idempotencyKey,
          requestHash
        })
        .returning({ id: ingestionKeys.id });
      const [meeting] = await tx
        .insert(meetings)
        .values({
          workspaceId: input.workspaceId,
          createdBy: input.userId,
          title: input.payload.title,
          source: input.payload.source,
          startedAt: new Date(input.payload.startedAt),
          endedAt: new Date(input.payload.endedAt)
        })
        .returning();
      if (!meeting || !keyRow) throw new Error('Failed to persist meeting');
      await tx.insert(transcriptSegments).values(
        input.payload.segments.map((segment, position) => ({
          meetingId: meeting.id,
          clientId: segment.clientId,
          position,
          speaker: segment.speaker,
          text: segment.text,
          startMs: segment.startMs,
          endMs: segment.endMs
        }))
      );
      await tx
        .update(ingestionKeys)
        .set({ meetingId: meeting.id })
        .where(eq(ingestionKeys.id, keyRow.id));
      const fullMeeting = await getMeeting(input.workspaceId, meeting.id, tx);
      if (!fullMeeting) throw new Error('Failed to read created meeting');
      return { meeting: fullMeeting, replayed: false };
    });
  } catch (error) {
    if (String((error as { code?: string }).code).startsWith('SQLITE_CONSTRAINT')) {
      const [existing] = await db
        .select({ requestHash: ingestionKeys.requestHash, meetingId: ingestionKeys.meetingId })
        .from(ingestionKeys)
        .where(
          and(
            eq(ingestionKeys.extensionSessionId, input.extensionSessionId),
            eq(ingestionKeys.key, input.idempotencyKey)
          )
        )
        .limit(1);
      if (existing?.requestHash === requestHash && existing.meetingId) {
        const meeting = await getMeeting(input.workspaceId, existing.meetingId);
        if (meeting) return { meeting, replayed: true };
      }
    }
    throw error;
  }
}

type DbLike = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function getMeeting(workspaceId: string, meetingId: string, database: DbLike = db) {
  const [meeting] = await database
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.id, meetingId),
        eq(meetings.workspaceId, workspaceId),
        isNull(meetings.deletedAt)
      )
    )
    .limit(1);
  if (!meeting) return null;
  const [segments, analysisRows] = await Promise.all([
    database
      .select()
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, meetingId))
      .orderBy(transcriptSegments.position),
    database.select().from(analyses).where(eq(analyses.meetingId, meetingId)).limit(1)
  ]);
  const analysis = analysisRows[0];
  return {
    ...meeting,
    segments: segments.map((segment) => ({
      id: segment.id,
      clientId: segment.clientId,
      speaker: segment.speaker,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs
    })),
    speakerStats: calculateSpeakerStats(segments),
    analysis: analysis
      ? {
          id: analysis.id,
          status: analysis.status,
          model: analysis.model,
          failureReason: analysis.failureReason,
          attemptCount: analysis.attemptCount,
          analyzedAt: analysis.completedAt,
          ...(analysis.result ?? {})
        }
      : null
  };
}

export async function listMeetings(input: {
  workspaceId: string;
  limit: number;
  cursor?: string | undefined;
  search?: string | undefined;
  speaker?: string | undefined;
}) {
  const conditions = [eq(meetings.workspaceId, input.workspaceId), isNull(meetings.deletedAt)];
  if (input.cursor) {
    const [cursorRow] = await db
      .select({ id: meetings.id, createdAt: meetings.createdAt })
      .from(meetings)
      .where(and(eq(meetings.id, input.cursor), eq(meetings.workspaceId, input.workspaceId)))
      .limit(1);
    if (cursorRow)
      conditions.push(
        or(
          lt(meetings.createdAt, cursorRow.createdAt),
          and(eq(meetings.createdAt, cursorRow.createdAt), lt(meetings.id, cursorRow.id))
        )!
      );
  }
  if (input.search) {
    const escaped = input.search.replaceAll('"', '""');
    const ftsQuery = `"${escaped}"*`;
    conditions.push(
      or(
        like(sql`lower(${meetings.title})`, `%${input.search.toLowerCase()}%`),
        sql`exists (
    select 1 from transcript_segments ts
    join transcript_segments_fts fts on fts.rowid = ts.rowid
    where ts.meeting_id = ${meetings.id} and transcript_segments_fts match ${ftsQuery}
  )`
      )!
    );
  }
  if (input.speaker)
    conditions.push(sql`exists (
    select 1 from transcript_segments ts where ts.meeting_id = ${meetings.id} and ts.speaker = ${input.speaker}
  )`);
  const rows = await db
    .select({
      id: meetings.id,
      workspaceId: meetings.workspaceId,
      title: meetings.title,
      source: meetings.source,
      startedAt: meetings.startedAt,
      endedAt: meetings.endedAt,
      createdAt: meetings.createdAt,
      updatedAt: meetings.updatedAt,
      segmentCount: sql<number>`(select count(*) from transcript_segments ts where ts.meeting_id = ${meetings.id})`,
      analysisStatus: analyses.status
    })
    .from(meetings)
    .leftJoin(analyses, eq(analyses.meetingId, meetings.id))
    .where(and(...conditions))
    .orderBy(desc(meetings.createdAt), desc(meetings.id))
    .limit(input.limit + 1);
  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function deleteMeeting(workspaceId: string, meetingId: string): Promise<boolean> {
  const updated = await db
    .update(meetings)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(meetings.id, meetingId),
        eq(meetings.workspaceId, workspaceId),
        isNull(meetings.deletedAt)
      )
    )
    .returning({ id: meetings.id });
  return updated.length === 1;
}

export async function assertMeetingInWorkspace(
  workspaceId: string,
  meetingId: string
): Promise<void> {
  const [result] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(
      and(
        eq(meetings.id, meetingId),
        eq(meetings.workspaceId, workspaceId),
        isNull(meetings.deletedAt)
      )
    )
    .limit(1);
  if (!result) throw new ApiError(404, 'NOT_FOUND', 'Meeting not found');
}
