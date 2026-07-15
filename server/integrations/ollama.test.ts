import { describe, expect, it } from 'vitest';
import { parseAnalysisContent } from './ollama.js';

describe('Ollama response validation', () => {
  const valid = { summary: ['สรุป'], decisions: [], actionItems: [], topics: [] };
  it('accepts the documented structured response', () =>
    expect(parseAnalysisContent(JSON.stringify(valid))).toEqual(valid));
  it('rejects invalid JSON and oversized fields', () => {
    expect(() => parseAnalysisContent('{')).toThrow('invalid JSON');
    expect(() => parseAnalysisContent(JSON.stringify({ ...valid, summary: [1] }))).toThrow(
      'analysis schema'
    );
  });
});
