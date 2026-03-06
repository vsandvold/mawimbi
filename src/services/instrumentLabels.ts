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
  | 'percussion'
  | 'unknown';

export const FALLBACK_LABEL: InstrumentLabel = 'unknown';

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
 * Returns 'unknown' for any unrecognised label (shouldn't happen
 * since CLAP always returns one of the provided candidates).
 */
export function mapToInstrumentLabel(candidateLabel: string): InstrumentLabel {
  return CANDIDATE_TO_INSTRUMENT[candidateLabel] ?? FALLBACK_LABEL;
}

// Filename keyword patterns for each instrument category.
// Order matters: more specific patterns (e.g. "bass guitar") must come before
// less specific ones (e.g. "bass") to avoid false matches.
const FILENAME_PATTERNS: Array<{ keywords: RegExp; label: InstrumentLabel }> = [
  {
    keywords: /\b(?:vocal|vocals|voice|voices|singing|singer|choir|vox)\b/,
    label: 'vocals',
  },
  {
    keywords: /\b(?:bass(?:\s+guitar)?|sub\s*bass)\b/,
    label: 'bass',
  },
  {
    keywords: /\b(?:guitar|gtr|guitars)\b/,
    label: 'guitar',
  },
  {
    keywords:
      /\b(?:drums?|drum[_ -]?kit|kick|snare|hihat|hi[_ -]?hat|cymbal)\b/,
    label: 'drums',
  },
  {
    keywords: /\b(?:piano|keys|keyboard|organ|rhodes|wurlitzer)\b/,
    label: 'keyboard',
  },
  {
    keywords: /\b(?:strings?|violin|viola|cello|contrabass|orchestra)\b/,
    label: 'strings',
  },
  {
    keywords: /\b(?:brass|trumpet|trombone|tuba|horn|cornet|flugelhorn)\b/,
    label: 'brass',
  },
  {
    keywords:
      /\b(?:woodwind|flute|clarinet|saxophone|sax|oboe|bassoon|piccolo|recorder)\b/,
    label: 'woodwind',
  },
  {
    keywords: /\b(?:synth|synthesizer|pad|lead[_ -]?synth|analog)\b/,
    label: 'synth',
  },
  {
    keywords:
      /\b(?:percussion|perc|tambourine|shaker|congas?|bongos?|maracas?|claves?|cowbell|triangle|cajon|djembe|timbales?)\b/,
    label: 'percussion',
  },
];

/**
 * Attempts to classify an instrument from the filename by matching
 * known keywords. Returns null if no keyword matches.
 */
export function classifyFromFilename(fileName: string): InstrumentLabel | null {
  // Strip file extension, normalize separators to spaces, lowercase
  const stem = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  for (const { keywords, label } of FILENAME_PATTERNS) {
    if (keywords.test(stem)) {
      return label;
    }
  }

  return null;
}
