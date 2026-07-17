import { z } from 'zod';
import { workspaceRoles } from './permissions.js';

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(12, 'Password must contain at least 12 characters')
  .max(128)
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value), {
    message: 'Password must contain uppercase, lowercase, and numeric characters'
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(120),
  workspaceName: z.string().trim().min(2).max(120)
});

export const extensionLoginSchema = loginSchema.extend({ workspaceId: uuidSchema.optional() });
export const refreshExtensionSchema = z.object({
  refreshToken: z.string().min(32).max(512),
  workspaceId: uuidSchema.optional()
});

export const transcriptSegmentInputSchema = z
  .object({
    clientId: z.string().trim().min(1).max(120).optional(),
    speaker: z.string().trim().min(1).max(160),
    text: z.string().trim().min(1).max(10_000),
    startMs: z.number().int().min(0).max(604_800_000),
    endMs: z.number().int().min(0).max(604_800_000)
  })
  .refine((value) => value.endMs >= value.startMs, {
    message: 'endMs must be greater than or equal to startMs',
    path: ['endMs']
  });

export const meetingIngestionSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    source: z.literal('google-meet-caption'),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    segments: z.array(transcriptSegmentInputSchema).min(1).max(25_000)
  })
  .refine((value) => new Date(value.endedAt) >= new Date(value.startedAt), {
    message: 'endedAt must not precede startedAt',
    path: ['endedAt']
  });

export const workspaceCreateSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const memberCreateSchema = z.object({ email: emailSchema, role: z.enum(workspaceRoles) });
export const memberUpdateSchema = z.object({ role: z.enum(workspaceRoles) });
export const meetingListQuerySchema = z.object({
  workspaceId: uuidSchema,
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  speaker: z.string().trim().max(160).optional()
});

export const analysisOutputSchema = z.object({
  summary: z.array(z.string().trim().min(1).max(2_000)).max(10),
  decisions: z.array(z.string().trim().min(1).max(2_000)).max(50),
  actionItems: z
    .array(
      z.object({
        owner: z.string().trim().min(1).max(160),
        task: z.string().trim().min(1).max(2_000),
        due: z.string().trim().min(1).max(160)
      })
    )
    .max(100),
  topics: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(240),
        summary: z.string().trim().min(1).max(4_000),
        speakers: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(160),
              contribution: z.string().trim().min(1).max(2_000)
            })
          )
          .max(100)
      })
    )
    .max(50)
});

export type MeetingIngestion = z.infer<typeof meetingIngestionSchema>;
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
