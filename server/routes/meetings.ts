import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  meetingIngestionSchema,
  meetingListQuerySchema,
  uuidSchema
} from '../../packages/shared/schemas.js';
import {
  requireCsrf,
  requireExtensionAuth,
  requireWebAuth,
  requireWorkspace
} from '../auth/middleware.js';
import { ApiError } from '../http/errors.js';
import { enqueueAnalysis } from '../services/analysis-jobs.js';
import { writeAudit } from '../services/audit.js';
import { deleteMeeting, getMeeting, ingestMeeting, listMeetings } from '../services/meetings.js';

const router = Router();
const ingestionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
const analysisLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

router.post('/ingest', ingestionLimiter, requireExtensionAuth, async (request, response) => {
  if (!request.auth?.role || !['owner', 'admin', 'member'].includes(request.auth.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Your workspace role cannot create meetings');
  }
  const idempotencyKey = request.get('idempotency-key');
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new ApiError(
      422,
      'IDEMPOTENCY_KEY_INVALID',
      'A valid Idempotency-Key header is required'
    );
  }
  const result = await ingestMeeting({
    payload: meetingIngestionSchema.parse(request.body),
    userId: request.auth.userId,
    workspaceId: request.auth.workspaceId!,
    extensionSessionId: request.auth.sessionId,
    idempotencyKey
  });
  await writeAudit({
    request,
    actorUserId: request.auth.userId,
    workspaceId: request.auth.workspaceId,
    action: 'meeting.ingest',
    targetType: 'meeting',
    targetId: result.meeting.id,
    success: true,
    metadata: { replayed: result.replayed }
  });
  response.status(result.replayed ? 200 : 201).json(result);
});

router.use(requireWebAuth);

function workspaceFromQuery(request: Request, _response: Response, next: NextFunction): void {
  try {
    request.params.workspaceId = uuidSchema.parse(request.query.workspaceId);
    next();
  } catch (error) {
    next(error);
  }
}

router.get('/', requireWorkspace('meetings:read'), async (request, response) => {
  const query = meetingListQuerySchema.parse(request.query);
  response.json(await listMeetings(query));
});

router.get(
  '/:meetingId',
  workspaceFromQuery,
  requireWorkspace('meetings:read'),
  async (request, response) => {
    const meetingId = uuidSchema.parse(request.params.meetingId);
    const workspaceId = uuidSchema.parse(request.params.workspaceId);
    const meeting = await getMeeting(workspaceId, meetingId);
    if (!meeting) throw new ApiError(404, 'NOT_FOUND', 'Meeting not found');
    response.json(meeting);
  }
);

router.delete(
  '/:meetingId',
  requireCsrf,
  workspaceFromQuery,
  requireWorkspace('meetings:delete'),
  async (request, response) => {
    const meetingId = uuidSchema.parse(request.params.meetingId);
    const workspaceId = uuidSchema.parse(request.params.workspaceId);
    if (!(await deleteMeeting(workspaceId, meetingId)))
      throw new ApiError(404, 'NOT_FOUND', 'Meeting not found');
    await writeAudit({
      request,
      actorUserId: request.auth!.userId,
      workspaceId,
      action: 'meeting.delete',
      targetType: 'meeting',
      targetId: meetingId,
      success: true
    });
    response.status(204).end();
  }
);

router.post(
  '/:meetingId/analyze',
  analysisLimiter,
  requireCsrf,
  workspaceFromQuery,
  requireWorkspace('meetings:analyze'),
  async (request, response) => {
    const meetingId = uuidSchema.parse(request.params.meetingId);
    const workspaceId = uuidSchema.parse(request.params.workspaceId);
    const analysis = await enqueueAnalysis(workspaceId, meetingId);
    await writeAudit({
      request,
      actorUserId: request.auth!.userId,
      workspaceId,
      action: 'analysis.enqueue',
      targetType: 'meeting',
      targetId: meetingId,
      success: true
    });
    response.status(202).json(analysis);
  }
);

export const meetingsRouter = router;
