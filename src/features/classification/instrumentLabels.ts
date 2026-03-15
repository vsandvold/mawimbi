// instrumentLabels — maps MTG-Jamendo instrument predictions to app categories.
//
// The Jamendo instrument model outputs 40 sigmoid predictions (one per class).
// This module maps the top prediction to one of 10 InstrumentLabel categories.

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
  | 'percussion'
  | 'unknown';

export const FALLBACK_LABEL: InstrumentLabel = 'unknown';

/**
 * The 40 Jamendo instrument classes, ordered to match the model's output
 * tensor indices.
 */
export const JAMENDO_CLASSES = [
  'accordion',
  'acousticbassguitar',
  'acousticguitar',
  'bass',
  'beat',
  'bell',
  'bongo',
  'brass',
  'cello',
  'clarinet',
  'classicalguitar',
  'computer',
  'doublebass',
  'drummachine',
  'drums',
  'electricguitar',
  'electricpiano',
  'flute',
  'guitar',
  'harmonica',
  'harp',
  'horn',
  'keyboard',
  'oboe',
  'orchestra',
  'organ',
  'pad',
  'percussion',
  'piano',
  'pipeorgan',
  'rhodes',
  'sampler',
  'saxophone',
  'strings',
  'synthesizer',
  'trombone',
  'trumpet',
  'viola',
  'violin',
  'voice',
] as const;

// Jamendo class → InstrumentLabel category.
const JAMENDO_TO_INSTRUMENT: Record<string, InstrumentLabel> = {
  voice: 'vocals',
  acousticguitar: 'guitar',
  classicalguitar: 'guitar',
  electricguitar: 'guitar',
  guitar: 'guitar',
  acousticbassguitar: 'bass',
  bass: 'bass',
  doublebass: 'bass',
  drums: 'drums',
  drummachine: 'drums',
  accordion: 'keyboard',
  electricpiano: 'keyboard',
  keyboard: 'keyboard',
  organ: 'keyboard',
  piano: 'keyboard',
  pipeorgan: 'keyboard',
  rhodes: 'keyboard',
  cello: 'strings',
  harp: 'strings',
  orchestra: 'strings',
  strings: 'strings',
  viola: 'strings',
  violin: 'strings',
  brass: 'brass',
  horn: 'brass',
  trombone: 'brass',
  trumpet: 'brass',
  clarinet: 'woodwind',
  flute: 'woodwind',
  harmonica: 'woodwind',
  oboe: 'woodwind',
  saxophone: 'woodwind',
  computer: 'synth',
  pad: 'synth',
  sampler: 'synth',
  synthesizer: 'synth',
  beat: 'percussion',
  bell: 'percussion',
  bongo: 'percussion',
  percussion: 'percussion',
};

/**
 * Maps a Jamendo instrument class name to the corresponding InstrumentLabel.
 * Returns 'unknown' for any unrecognised class.
 */
export function mapToInstrumentLabel(jamendoClass: string): InstrumentLabel {
  return JAMENDO_TO_INSTRUMENT[jamendoClass] ?? FALLBACK_LABEL;
}
