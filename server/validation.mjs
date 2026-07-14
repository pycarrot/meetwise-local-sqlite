import { z } from 'zod';

const segmentSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  speaker: z.string().trim().min(1).max(160).default('ไม่ทราบชื่อ'),
  text: z.string().trim().min(1).max(10_000),
  startMs: z.coerce.number().finite().min(0).max(604_800_000).default(0),
  endMs: z.coerce.number().finite().min(0).max(604_800_000).default(0)
});

export const meetingImportSchema = z.object({
  id: z
    .string()
    .uuid()
    .or(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/))
    .optional(),
  title: z.string().trim().min(1).max(240).default('การประชุมไม่มีชื่อ'),
  source: z.enum(['google-meet-caption', 'manual-import']).default('google-meet-caption'),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  endedAt: z.iso.datetime({ offset: true }).optional(),
  segments: z.array(segmentSchema).min(1).max(25_000)
});

export function parseMeetingImport(value) {
  return meetingImportSchema.parse(value);
}
