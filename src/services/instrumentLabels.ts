// instrumentLabels — candidate labels for CLAP zero-shot audio classification.
//
// Each candidate is a short descriptive phrase that CLAP matches against audio
// embeddings. The mapping from candidate text to InstrumentLabel is 1:1 — no
// multi-label disambiguation needed (unlike the old AudioSet mapping).

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

// Candidate label text → InstrumentLabel.
// These phrases are passed to CLAP as the candidate set. CLAP returns the
// best-matching phrase, which we look up here to get the InstrumentLabel.
const CANDIDATE_TO_INSTRUMENT: Record<string, InstrumentLabel> = {
  'singing vocals': 'vocals',
  'electric guitar': 'guitar',
  'bass guitar': 'bass',
  'drum kit': 'drums',
  'acoustic piano': 'keyboard',
  'orchestral strings': 'strings',
  'brass instrument': 'brass',
  'woodwind instrument': 'woodwind',
  synthesizer: 'synth',
  percussion: 'percussion',
};

/**
 * The candidate label strings passed to CLAP's zero-shot classifier.
 */
export const CANDIDATE_LABELS = Object.keys(CANDIDATE_TO_INSTRUMENT);

/**
 * Maps a CLAP candidate label to the corresponding InstrumentLabel.
 * Returns 'percussion' for any unrecognised label (shouldn't happen
 * since CLAP always returns one of the provided candidates).
 */
export function mapToInstrumentLabel(candidateLabel: string): InstrumentLabel {
  return CANDIDATE_TO_INSTRUMENT[candidateLabel] ?? 'percussion';
}
