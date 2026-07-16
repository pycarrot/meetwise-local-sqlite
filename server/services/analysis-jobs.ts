import { and, eq, inArray, isNull } from 'drizzle-orm';
import { client, db } from '../db/client.js';
import {
  actionItems,
  analyses,
  analysisJobs,
  decisions,
  meetings,
  transcriptSegments
} from '../db/schema.js';
import { config } from '../config.js';
import { ApiError } from '../http/errors.js';
import { analyzeTranscript } from '../integrations/ollama.js';

export async function enqueueAnalysis(workspaceId: string, meetingId: string) {
  return db.transaction(async (tx) => {
    const [meeting] = await tx
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
    if (!meeting) throw new ApiError(404, 'NOT_FOUND', 'Meeting not found');
    const countRows = await tx
      .select({ count: transcriptSegments.id })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, meetingId))
      .limit(1);
    if (!countRows.length) throw new ApiError(422, 'EMPTY_TRANSCRIPT', 'Meeting has no transcript');
    let [analysis] = await tx
      .select()
      .from(analyses)
      .where(eq(analyses.meetingId, meetingId))
      .limit(1);
    if (analysis?.status === 'running' || analysis?.status === 'pending') return analysis;
    if (!analysis) {
      [analysis] = await tx.insert(analyses).values({ meetingId, status: 'pending' }).returning();
    } else {
      [analysis] = await tx
        .update(analyses)
        .set({ status: 'pending', failureReason: null, updatedAt: new Date() })
        .where(eq(analyses.id, analysis.id))
        .returning();
    }
    if (!analysis) throw new Error('Failed to create analysis');
    await tx
      .delete(analysisJobs)
      .where(
        and(
          eq(analysisJobs.analysisId, analysis.id),
          inArray(analysisJobs.status, ['completed', 'failed'])
        )
      );
    await tx.insert(analysisJobs).values({ analysisId: analysis.id, workspaceId });
    return analysis;
  });
}

type ClaimedJob = {
  job_id: string;
  analysis_id: string;
  meeting_id: string;
  attempt_count: number;
};

export async function processNextJob(workerId: string): Promise<boolean> {
  let job: ClaimedJob | undefined;
  const transaction = await client.transaction('write');
  try {
    const now = Date.now();
    const staleBefore = now - config.analysisJobLockTimeoutMs;
    const stale = await transaction.execute({
      sql: `select analysis_id from analysis_jobs where status='running' and locked_at < ?`,
      args: [staleBefore]
    });
    if (stale.rows.length) {
      const ids = stale.rows.map((row) => String(row.analysis_id));
      const placeholders = ids.map(() => '?').join(',');
      await transaction.execute({
        sql: `update analysis_jobs set status='pending', locked_at=null, locked_by=null,
          last_error='Worker interrupted; job recovered', run_after=?, updated_at=?
          where analysis_id in (${placeholders})`,
        args: [now, now, ...ids]
      });
      await transaction.execute({
        sql: `update analyses set status='pending', failure_reason='Worker interrupted; job recovered', updated_at=?
          where id in (${placeholders})`,
        args: [now, ...ids]
      });
    }
    const claimed = await transaction.execute({
      sql: `select j.id job_id, j.analysis_id, a.meeting_id, j.attempt_count
      from analysis_jobs j join analyses a on a.id=j.analysis_id
      where j.status='pending' and j.run_after <= ?
      order by j.created_at limit 1`,
      args: [now]
    });
    const row = claimed.rows[0];
    job = row
      ? {
          job_id: String(row.job_id),
          analysis_id: String(row.analysis_id),
          meeting_id: String(row.meeting_id),
          attempt_count: Number(row.attempt_count)
        }
      : undefined;
    if (!job) {
      await transaction.commit();
      return false;
    }
    await transaction.execute({
      sql: `update analysis_jobs set status='running', locked_at=?, locked_by=?,
        attempt_count=attempt_count+1, updated_at=? where id=?`,
      args: [now, workerId, now, job.job_id]
    });
    await transaction.execute({
      sql: `update analyses set status='running', started_at=?, attempt_count=attempt_count+1,
        failure_reason=null, updated_at=? where id=?`,
      args: [now, now, job.analysis_id]
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  try {
    const segments = await db
      .select({
        speaker: transcriptSegments.speaker,
        text: transcriptSegments.text,
        startMs: transcriptSegments.startMs
      })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.meetingId, job.meeting_id))
      .orderBy(transcriptSegments.position);
    const result = await analyzeTranscript(segments);
    await db.transaction(async (tx) => {
      await tx.delete(decisions).where(eq(decisions.analysisId, job!.analysis_id));
      await tx.delete(actionItems).where(eq(actionItems.analysisId, job!.analysis_id));
      if (result.decisions.length)
        await tx.insert(decisions).values(
          result.decisions.map((text, position) => ({
            analysisId: job!.analysis_id,
            position,
            text
          }))
        );
      if (result.actionItems.length)
        await tx.insert(actionItems).values(
          result.actionItems.map((item, position) => ({
            analysisId: job!.analysis_id,
            position,
            ...item
          }))
        );
      await tx
        .update(analyses)
        .set({
          status: 'completed',
          model: config.ollamaModel,
          result,
          failureReason: null,
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(analyses.id, job!.analysis_id));
      await tx
        .update(analysisJobs)
        .set({ status: 'completed', lockedAt: null, lockedBy: null, updatedAt: new Date() })
        .where(eq(analysisJobs.id, job!.job_id));
    });
  } catch (error) {
    const sanitized = sanitizeFailure(error);
    const attempt = job.attempt_count + 1;
    const retry = attempt < config.analysisMaxAttempts;
    await db.transaction(async (tx) => {
      await tx
        .update(analysisJobs)
        .set({
          status: retry ? 'pending' : 'failed',
          lastError: sanitized,
          lockedAt: null,
          lockedBy: null,
          runAfter: new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** attempt)),
          updatedAt: new Date()
        })
        .where(eq(analysisJobs.id, job!.job_id));
      await tx
        .update(analyses)
        .set({
          status: retry ? 'pending' : 'failed',
          failureReason: sanitized,
          updatedAt: new Date()
        })
        .where(eq(analyses.id, job!.analysis_id));
    });
  }
  return true;
}

export function sanitizeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Analysis failed';
  return message.replace(/https?:\/\/[^\s]+/g, '[service]').slice(0, 500);
}
