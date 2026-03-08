import type { TrackId } from './track';

export type TranscriptionWord = {
  text: string;
  start: number; // seconds
  end: number; // seconds
};

export type TranscriptionSegment = {
  text: string;
  start: number; // seconds
  end: number; // seconds
  words: TranscriptionWord[];
};

export type Transcription = {
  trackId: TrackId;
  language: string;
  segments: TranscriptionSegment[];
};
