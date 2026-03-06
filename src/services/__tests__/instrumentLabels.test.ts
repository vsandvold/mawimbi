import { CANDIDATE_LABELS, mapToInstrumentLabel } from '../instrumentLabels';

describe('CANDIDATE_LABELS', () => {
  it('contains 10 candidate labels', () => {
    expect(CANDIDATE_LABELS).toHaveLength(10);
  });

  it('includes labels for all instrument categories', () => {
    expect(CANDIDATE_LABELS).toContain('singing vocals');
    expect(CANDIDATE_LABELS).toContain('electric guitar');
    expect(CANDIDATE_LABELS).toContain('bass guitar');
    expect(CANDIDATE_LABELS).toContain('drum kit');
    expect(CANDIDATE_LABELS).toContain('acoustic piano');
    expect(CANDIDATE_LABELS).toContain('orchestral strings');
    expect(CANDIDATE_LABELS).toContain('brass instrument');
    expect(CANDIDATE_LABELS).toContain('woodwind instrument');
    expect(CANDIDATE_LABELS).toContain('synthesizer');
    expect(CANDIDATE_LABELS).toContain('percussion');
  });
});

describe('mapToInstrumentLabel', () => {
  it.each([
    ['singing vocals', 'vocals'],
    ['electric guitar', 'guitar'],
    ['bass guitar', 'bass'],
    ['drum kit', 'drums'],
    ['acoustic piano', 'keyboard'],
    ['orchestral strings', 'strings'],
    ['brass instrument', 'brass'],
    ['woodwind instrument', 'woodwind'],
    ['synthesizer', 'synth'],
    ['percussion', 'percussion'],
  ])('maps "%s" to "%s"', (candidateLabel, expected) => {
    expect(mapToInstrumentLabel(candidateLabel)).toBe(expected);
  });

  it('falls back to unknown for unrecognised labels', () => {
    expect(mapToInstrumentLabel('unknown label')).toBe('unknown');
  });
});
