import {
  CANDIDATE_LABELS,
  classifyFromFilename,
  mapToInstrumentLabel,
} from '../instrumentLabels';

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

describe('classifyFromFilename', () => {
  it.each([
    ['vocals.wav', 'vocals'],
    ['lead_vocals_v2.mp3', 'vocals'],
    ['backing-voice.wav', 'vocals'],
    ['choir_harmony.flac', 'vocals'],
    ['singing-take3.wav', 'vocals'],
    ['guitar_solo.wav', 'guitar'],
    ['electric-guitar.mp3', 'guitar'],
    ['acoustic_gtr.flac', 'guitar'],
    ['bass_track.wav', 'bass'],
    ['bass-guitar.mp3', 'bass'],
    ['sub_bass.flac', 'bass'],
    ['drums_main.wav', 'drums'],
    ['drum-kit.mp3', 'drums'],
    ['kick_snare.flac', 'drums'],
    ['piano_melody.wav', 'keyboard'],
    ['keys_pad.mp3', 'keyboard'],
    ['organ_solo.flac', 'keyboard'],
    ['strings_section.wav', 'strings'],
    ['violin_solo.mp3', 'strings'],
    ['cello_part.flac', 'strings'],
    ['brass_section.wav', 'brass'],
    ['trumpet_solo.mp3', 'brass'],
    ['trombone.flac', 'brass'],
    ['horn_part.wav', 'brass'],
    ['flute_melody.wav', 'woodwind'],
    ['clarinet_solo.mp3', 'woodwind'],
    ['saxophone.flac', 'woodwind'],
    ['oboe_part.wav', 'woodwind'],
    ['synth_pad.wav', 'synth'],
    ['synthesizer_lead.mp3', 'synth'],
    ['perc_hits.wav', 'percussion'],
    ['tambourine.mp3', 'percussion'],
    ['shaker_loop.flac', 'percussion'],
    ['congas.wav', 'percussion'],
  ])('classifies "%s" as "%s"', (fileName, expected) => {
    expect(classifyFromFilename(fileName)).toBe(expected);
  });

  it('is case insensitive', () => {
    expect(classifyFromFilename('VOCALS_MAIN.WAV')).toBe('vocals');
    expect(classifyFromFilename('Guitar-Solo.MP3')).toBe('guitar');
  });

  it('returns null when no instrument keyword is found', () => {
    expect(classifyFromFilename('track_01.wav')).toBeNull();
    expect(classifyFromFilename('audio.mp3')).toBeNull();
    expect(classifyFromFilename('song_mix.flac')).toBeNull();
  });

  it('strips file extension before matching', () => {
    expect(classifyFromFilename('lead_vocals.wav')).toBe('vocals');
    expect(classifyFromFilename('guitar.mp3')).toBe('guitar');
  });
});
