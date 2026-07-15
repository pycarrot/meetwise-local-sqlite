type Segment = { speaker: string; text: string; startMs: number; endMs: number };

export type SpeakerStat = {
  name: string;
  durationMs: number;
  units: number;
  turns: number;
  share: number;
  basis: 'duration' | 'spoken_units';
};

function spokenUnits(text: string): number {
  const words = text.trim().split(/\s+/u).filter(Boolean).length;
  const thai = (text.match(/[\u0E00-\u0E7F]/gu) ?? []).length;
  return Math.max(words, thai, 1);
}

export function calculateSpeakerStats(segments: Segment[]): SpeakerStat[] {
  const values = new Map<string, Omit<SpeakerStat, 'share' | 'basis'>>();
  for (const segment of segments) {
    const current = values.get(segment.speaker) ?? {
      name: segment.speaker,
      durationMs: 0,
      units: 0,
      turns: 0
    };
    current.durationMs += Math.max(0, segment.endMs - segment.startMs);
    current.units += spokenUnits(segment.text);
    current.turns += 1;
    values.set(segment.speaker, current);
  }
  const durationTotal = [...values.values()].reduce((sum, value) => sum + value.durationMs, 0);
  const unitTotal = [...values.values()].reduce((sum, value) => sum + value.units, 0);
  const basis: SpeakerStat['basis'] = durationTotal > 0 ? 'duration' : 'spoken_units';
  const total = basis === 'duration' ? durationTotal : unitTotal;
  return [...values.values()]
    .map((value) => ({
      ...value,
      share: total ? ((basis === 'duration' ? value.durationMs : value.units) / total) * 100 : 0,
      basis
    }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}
