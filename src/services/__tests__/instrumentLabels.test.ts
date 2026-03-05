import { mapToInstrumentLabel } from '../instrumentLabels';

describe('mapToInstrumentLabel', () => {
  it.each([
    ['Singing', 'vocals'],
    ['Choir', 'vocals'],
    ['Male singing', 'vocals'],
    ['Female singing', 'vocals'],
    ['Guitar', 'guitar'],
    ['Electric guitar', 'guitar'],
    ['Acoustic guitar', 'guitar'],
    ['Banjo', 'guitar'],
    ['Bass guitar', 'bass'],
    ['Double bass', 'bass'],
    ['Drum kit', 'drums'],
    ['Drum', 'drums'],
    ['Snare drum', 'drums'],
    ['Bass drum', 'drums'],
    ['Keyboard (musical)', 'keyboard'],
    ['Piano', 'keyboard'],
    ['Organ', 'keyboard'],
    ['Accordion', 'keyboard'],
    ['Violin, fiddle', 'strings'],
    ['Cello', 'strings'],
    ['String section', 'strings'],
    ['Harp', 'strings'],
    ['Trumpet', 'brass'],
    ['Trombone', 'brass'],
    ['French horn', 'brass'],
    ['Flute', 'woodwind'],
    ['Saxophone', 'woodwind'],
    ['Clarinet', 'woodwind'],
    ['Synthesizer', 'synth'],
    ['Percussion', 'percussion'],
    ['Cymbal', 'percussion'],
    ['Tambourine', 'percussion'],
  ])('maps "%s" to "%s"', (audioSetLabel, expected) => {
    expect(mapToInstrumentLabel(audioSetLabel)).toBe(expected);
  });

  it('falls back to percussion for unmapped labels', () => {
    expect(mapToInstrumentLabel('Speech')).toBe('percussion');
    expect(mapToInstrumentLabel('Car horn')).toBe('percussion');
  });
});
