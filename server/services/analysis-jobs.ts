import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
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
      .for('update')
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
  const client = await pool.connect();
  let job: ClaimedJob | undefined;
  try {
    await client.query('begin');
    await client.query(
      `with stale as (
        update analysis_jobs set status='pending', locked_at=null, locked_by=null,
          last_error='Worker interrupted; job recovered', run_after=now(), updated_at=now()
        where status='running' and locked_at < now() - ($1::int * interval '1 millisecond')
        returning analysis_id
      ) update analyses set status='pending', failure_reason='Worker interrupted; job recovered', updated_at=now()
        where id in (select analysis_id from stale)`,
      [config.analysisJobLockTimeoutMs]
    );
    const claimed =
      await client.query<ClaimedJob>(`select j.id job_id, j.analysis_id, a.meeting_id, j.attempt_count
      from analysis_jobs j join analyses a on a.id=j.analysis_id
      where j.status='pending' and j.run_after <= now()
      order by j.created_at for update skip locked limit 1`);
    job = claimed.rows[0];
    if (!job) {
      await client.query('commit');
      return false;
    }
    await client.query(
      `update analysis_jobs set status='running', locked_at=now(), locked_by=$2,
      attempt_count=attempt_count+1, updated_at=now() where id=$1`,
      [job.job_id, workerId]
    );
    await client.query(
      `update analyses set status='running', started_at=now(), attempt_count=attempt_count+1,
      failure_reason=null, updated_at=now() where id=$1`,
      [job.analysis_id]
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
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
