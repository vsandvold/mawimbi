// PlaybackService — owns the playback state machine and Tone.js transport.
//
// State machine: stopped → playing ⇄ paused → stopped
//
// Encapsulates the Tone.js transport so the rest of the app interacts
// with playback through signals and service methods, never directly
// with the audio engine.

import { computed, signal, type ReadonlySignal } from '@preact/signals-react';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

type Transport = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  seconds: number;
  state: string;
};

class PlaybackService {
  readonly playbackState = signal<PlaybackState>('stopped');
  readonly transportTime = signal(0);
  readonly totalTime = signal(0);
  readonly loudness = signal(0);
  readonly isPlaying: ReadonlySignal<boolean>;

  private transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
    this.isPlaying = computed(() => this.playbackState.value === 'playing');
  }

  // --- State machine transitions (with integrated transport control) ---

  play(): void {
    const state = this.playbackState.value;
    if (state === 'playing') return;

    if (state === 'stopped' && this.isAtEndOfTimeline()) {
      this.transportTime.value = 0;
      this.transport.seconds = 0;
    }

    this.playbackState.value = 'playing';
    this.transport.start();
  }

  pause(): void {
    if (this.playbackState.value !== 'playing') return;
    this.playbackState.value = 'paused';
    this.transport.pause();
  }

  stop(): void {
    if (this.playbackState.value === 'stopped') return;
    this.playbackState.value = 'stopped';
    this.transport.stop();
  }

  togglePlayback(): void {
    if (this.playbackState.value === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  rewind(): void {
    this.transport.stop();
    this.transport.seconds = 0;
    this.playbackState.value = 'stopped';
    this.transportTime.value = 0;
  }

  seekTo(time: number): void {
    this.transportTime.value = time;
    this.transport.seconds = time;
  }

  // --- Engine access ---

  getEngineTime(): number {
    return this.transport.seconds;
  }

  setEngineTime(time: number): void {
    this.transport.seconds = time;
  }

  // --- Derived queries ---

  isPaused(): boolean {
    return this.playbackState.value === 'paused';
  }

  isStopped(): boolean {
    return this.playbackState.value === 'stopped';
  }

  // --- Reset (used in tests and when navigating away) ---

  reset(): void {
    this.playbackState.value = 'stopped';
    this.transportTime.value = 0;
    this.totalTime.value = 0;
    this.loudness.value = 0;
  }

  private isAtEndOfTimeline(): boolean {
    return (
      this.transportTime.value.toFixed(1) === this.totalTime.value.toFixed(1) &&
      this.totalTime.value > 0
    );
  }
}

export default PlaybackService;
