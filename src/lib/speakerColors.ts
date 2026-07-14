import type { SpeakerStat } from '../types';

export const speakerColors = ['#16a66a', '#3979e6', '#f19a15', '#8a63d2', '#e35d6a'];

export function colorForSpeaker(name: string, speakers: SpeakerStat[]) {
  const index = Math.max(
    0,
    speakers.findIndex((speaker) => speaker.name === name)
  );
  return speakerColors[index % speakerColors.length];
}
