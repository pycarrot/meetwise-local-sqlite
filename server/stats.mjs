const thaiSegmenter = new Intl.Segmenter('th', { granularity: 'word' });

export function spokenUnits(text = '') {
  let units = 0;
  for (const segment of thaiSegmenter.segment(text.trim())) {
    if (segment.isWordLike) units += 1;
  }
  return Math.max(units, text.replace(/\s+/g, '').length / 4, 1);
}

export function computeSpeakerStats(segments = []) {
  const speakers = new Map();

  for (const segment of segments) {
    const name = segment.speaker?.trim() || 'ไม่ทราบชื่อ';
    const durationMs = Math.max(0, Number(segment.endMs || 0) - Number(segment.startMs || 0));
    const units = spokenUnits(segment.text);
    const current = speakers.get(name) || { name, durationMs: 0, units: 0, turns: 0 };
    current.durationMs += durationMs;
    current.units += units;
    current.turns += 1;
    speakers.set(name, current);
  }

  const values = [...speakers.values()];
  const hasDurations = values.some((speaker) => speaker.durationMs > 0);
  const total =
    values.reduce((sum, speaker) => sum + (hasDurations ? speaker.durationMs : speaker.units), 0) ||
    1;

  return values
    .map((speaker) => ({
      ...speaker,
      share: Math.round(((hasDurations ? speaker.durationMs : speaker.units) / total) * 1000) / 10,
      basis: hasDurations ? 'duration' : 'spoken_units'
    }))
    .sort((a, b) => b.share - a.share);
}

export function normalizeMeeting(input) {
  const segments = Array.isArray(input.segments)
    ? input.segments
        .filter((segment) => segment && typeof segment.text === 'string' && segment.text.trim())
        .map((segment, index) => ({
          id: segment.id || `segment-${index + 1}`,
          speaker: String(segment.speaker || 'ไม่ทราบชื่อ').trim(),
          text: segment.text.trim(),
          startMs: Math.max(0, Number(segment.startMs) || 0),
          endMs: Math.max(Number(segment.endMs) || 0, Number(segment.startMs) || 0)
        }))
    : [];

  const now = new Date().toISOString();
  return {
    id: input.id || crypto.randomUUID(),
    title: String(input.title || 'การประชุมไม่มีชื่อ').trim(),
    source: input.source || 'google-meet-caption',
    startedAt: input.startedAt || now,
    endedAt: input.endedAt || now,
    createdAt: input.createdAt || now,
    updatedAt: now,
    segments,
    speakerStats: computeSpeakerStats(segments),
    analysis: input.analysis || null
  };
}
