import { JAMENDO_CLASSES, mapToInstrumentLabel } from '../instrumentLabels';

describe('JAMENDO_CLASSES', () => {
  it('contains 40 Jamendo instrument classes', () => {
    expect(JAMENDO_CLASSES).toHaveLength(40);
  });

  it('is sorted alphabetically to match model output order', () => {
    const sorted = [...JAMENDO_CLASSES].sort();
    expect(JAMENDO_CLASSES).toEqual(sorted);
  });
});

describe('mapToInstrumentLabel', () => {
  it('maps voice to vocals', () => {
    expect(mapToInstrumentLabel('voice')).toBe('vocals');
  });

  it.each([
    ['acousticguitar', 'guitar'],
    ['classicalguitar', 'guitar'],
    ['electricguitar', 'guitar'],
    ['guitar', 'guitar'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['acousticbassguitar', 'bass'],
    ['bass', 'bass'],
    ['doublebass', 'bass'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['drums', 'drums'],
    ['drummachine', 'drums'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['accordion', 'keyboard'],
    ['electricpiano', 'keyboard'],
    ['keyboard', 'keyboard'],
    ['organ', 'keyboard'],
    ['piano', 'keyboard'],
    ['pipeorgan', 'keyboard'],
    ['rhodes', 'keyboard'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['cello', 'strings'],
    ['harp', 'strings'],
    ['orchestra', 'strings'],
    ['strings', 'strings'],
    ['viola', 'strings'],
    ['violin', 'strings'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['brass', 'brass'],
    ['horn', 'brass'],
    ['trombone', 'brass'],
    ['trumpet', 'brass'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['clarinet', 'woodwind'],
    ['flute', 'woodwind'],
    ['harmonica', 'woodwind'],
    ['oboe', 'woodwind'],
    ['saxophone', 'woodwind'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['computer', 'synth'],
    ['pad', 'synth'],
    ['sampler', 'synth'],
    ['synthesizer', 'synth'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it.each([
    ['beat', 'percussion'],
    ['bell', 'percussion'],
    ['bongo', 'percussion'],
    ['percussion', 'percussion'],
  ])('maps "%s" to "%s"', (jamendoClass, expected) => {
    expect(mapToInstrumentLabel(jamendoClass)).toBe(expected);
  });

  it('maps all 40 Jamendo classes to a known label', () => {
    for (const cls of JAMENDO_CLASSES) {
      const label = mapToInstrumentLabel(cls);
      expect(label).not.toBe('unknown');
    }
  });

  it('falls back to unknown for unrecognised classes', () => {
    expect(mapToInstrumentLabel('unknown class')).toBe('unknown');
  });
});
