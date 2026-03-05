// instrumentLabels — maps AudioSet class labels from the AST model
// to the instrument categories used by the UI icon system.

export type InstrumentLabel =
  | 'vocals'
  | 'guitar'
  | 'bass'
  | 'drums'
  | 'keyboard'
  | 'strings'
  | 'brass'
  | 'woodwind'
  | 'synth'
  | 'percussion';

// AudioSet labels → instrument category.
// Only instrument-related labels are mapped; everything else falls through
// to the default "unknown" icon via the UI layer.
const AUDIOSET_TO_INSTRUMENT: Record<string, InstrumentLabel> = {
  // Vocals
  Singing: 'vocals',
  Choir: 'vocals',
  'Male singing': 'vocals',
  'Female singing': 'vocals',
  'Child singing': 'vocals',
  'Synthetic singing': 'vocals',
  'Vocal music': 'vocals',

  // Guitar
  Guitar: 'guitar',
  'Electric guitar': 'guitar',
  'Acoustic guitar': 'guitar',
  'Steel guitar, slide guitar': 'guitar',
  'Tapping (guitar technique)': 'guitar',
  Banjo: 'guitar',
  Mandolin: 'guitar',
  Ukulele: 'guitar',
  Sitar: 'guitar',

  // Bass
  'Bass guitar': 'bass',
  'Double bass': 'bass',

  // Drums
  'Drum kit': 'drums',
  'Drum machine': 'drums',
  Drum: 'drums',
  'Snare drum': 'drums',
  'Drum roll': 'drums',
  'Bass drum': 'drums',

  // Keyboard
  'Keyboard (musical)': 'keyboard',
  Piano: 'keyboard',
  'Electric piano': 'keyboard',
  Organ: 'keyboard',
  'Electronic organ': 'keyboard',
  'Hammond organ': 'keyboard',
  Harpsichord: 'keyboard',
  Accordion: 'keyboard',

  // Strings
  'Plucked string instrument': 'strings',
  'Bowed string instrument': 'strings',
  'String section': 'strings',
  'Violin, fiddle': 'strings',
  Cello: 'strings',
  Harp: 'strings',

  // Brass
  'Brass instrument': 'brass',
  'French horn': 'brass',
  Trumpet: 'brass',
  Trombone: 'brass',

  // Woodwind
  'Wind instrument, woodwind instrument': 'woodwind',
  Flute: 'woodwind',
  Saxophone: 'woodwind',
  Clarinet: 'woodwind',
  Harmonica: 'woodwind',
  Bagpipes: 'woodwind',

  // Synth
  Synthesizer: 'synth',

  // Percussion
  Percussion: 'percussion',
  Cymbal: 'percussion',
  Tambourine: 'percussion',
  'Mallet percussion': 'percussion',
  'Drum and bass': 'percussion',
  'Singing bowl': 'percussion',
};

/**
 * Maps an AudioSet class label to the nearest instrument category.
 * Returns the label unchanged if no mapping exists (the UI will show
 * an "unknown" icon for unmapped labels).
 */
export function mapToInstrumentLabel(audioSetLabel: string): InstrumentLabel {
  return AUDIOSET_TO_INSTRUMENT[audioSetLabel] ?? 'percussion';
}
