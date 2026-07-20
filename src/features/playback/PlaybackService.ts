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
  // --- Private signals (only the service writes these) ---

  private readonly _playbackState = signal<PlaybackState>('stopped');
  private readonly _transportTime = signal(0);
  private readonly _totalTime = signal(0);
  private readonly _loudness = signal(0);
  private readonly _isPlaying: ReadonlySignal<boolean>;

  // Monotonic counter bumped by every explicit state *transition* — play(),
  // pause(), and stop() bump it only when they actually change state, not on
  // a guarded no-op (e.g. pause() while already paused); rewind() and
  // seekTo() have no such guard and always bump, since every call is a real
  // command. Never bumped by engine-driven updates (setTransportTime, the
  // internal stopAtEndOfTimeline). The "no-op doesn't bump" rule matters
  // because play()/pause() are also called as incidental cleanup elsewhere
  // (e.g. cancelling a count-in, RecordingService's overdub lifecycle) where
  // playback may already be in the target state — bumping there too would
  // spuriously cancel an unrelated armed follow-up. Lets a caller that armed
  // a delayed follow-up action (the scrubber's auto-resume after a debounced
  // seek, issue #475) detect whether an explicit command intervened before
  // that follow-up fires, by comparing epoch snapshots. Nothing renders from
  // it, so a plain field is enough — no signal.
  private _commandEpoch = 0;

  // --- Narrow channel for reactive consumers (hooks) ---

  readonly signals: {
    readonly playbackState: ReadonlySignal<PlaybackState>;
    readonly transportTime: ReadonlySignal<number>;
    readonly totalTime: ReadonlySignal<number>;
    readonly loudness: ReadonlySignal<number>;
    readonly isPlaying: ReadonlySignal<boolean>;
  };

  private transport: Transport;

  constructor(transport: Transport) {
    this.transport = transport;
    this._isPlaying = computed(() => this._playbackState.value === 'playing');
    this.signals = {
      playbackState: this._playbackState,
      transportTime: this._transportTime,
      totalTime: this._totalTime,
      loudness: this._loudness,
      isPlaying: this._isPlaying,
    };
  }

  // --- Plain getters for non-reactive consumers (tests, workflows) ---

  get playbackState(): PlaybackState {
    return this._playbackState.value;
  }

  get transportTime(): number {
    return this._transportTime.value;
  }

  get totalTime(): number {
    return this._totalTime.value;
  }

  get loudness(): number {
    return this._loudness.value;
  }

  get isPlaying(): boolean {
    return this._isPlaying.value;
  }

  get commandEpoch(): number {
    return this._commandEpoch;
  }

  // --- Setters for values that external code needs to update ---

  setTransportTime(time: number): void {
    this._transportTime.value = time;
    if (this._playbackState.value === 'playing' && this.isAtEndOfTimeline()) {
      this.stopAtEndOfTimeline();
    }
  }

  setTotalTime(time: number): void {
    this._totalTime.value = time;
  }

  setLoudness(value: number): void {
    this._loudness.value = value;
  }

  // --- State machine transitions (with integrated transport control) ---

  play(): void {
    const state = this._playbackState.value;
    if (state === 'playing') return;
    this.bumpCommandEpoch();

    if (state === 'stopped' && this.isAtEndOfTimeline()) {
      this._transportTime.value = 0;
      this.transport.seconds = 0;
    }

    this._playbackState.value = 'playing';
    // Skip starting the transport if it is already running.  During
    // recording, startOverdubRecording() starts the transport before
    // play() is called so the recording start time is captured at the
    // correct position.  Calling transport.start() again would restart
    // the clock and shift the recording alignment.
    if (this.transport.state !== 'started') {
      this.transport.start();
    }
  }

  pause(): void {
    if (this._playbackState.value !== 'playing') return;
    this.bumpCommandEpoch();
    this._playbackState.value = 'paused';
    this.transport.pause();
  }

  stop(): void {
    if (this._playbackState.value === 'stopped') return;
    this.bumpCommandEpoch();
    this._playbackState.value = 'stopped';
    this.transport.stop();
  }

  togglePlayback(): void {
    if (this._playbackState.value === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  rewind(): void {
    this.bumpCommandEpoch();
    this.transport.stop();
    this.transport.seconds = 0;
    this._playbackState.value = 'stopped';
    this._transportTime.value = 0;
  }

  seekTo(time: number): void {
    this.bumpCommandEpoch();
    this._transportTime.value = time;
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
    return this._playbackState.value === 'paused';
  }

  isStopped(): boolean {
    return this._playbackState.value === 'stopped';
  }

  // --- Reset (used in tests and when navigating away) ---

  reset(): void {
    this._playbackState.value = 'stopped';
    this._transportTime.value = 0;
    this._totalTime.value = 0;
    this._loudness.value = 0;
    this._commandEpoch = 0;
  }

  private bumpCommandEpoch(): void {
    this._commandEpoch += 1;
  }

  // Stops playback at the end of the timeline without rewinding.
  // Uses transport.pause() instead of transport.stop() to preserve
  // the current position, so the scrubber stays at the end. Deliberately
  // does not bump the command epoch: an armed scrub auto-resume (issue #475)
  // should still fire after this, restarting playback from 0 via play()'s
  // own end-of-timeline check — the least-surprise outcome (spec 002, Open
  // questions) rather than silently swallowing the resume.
  private stopAtEndOfTimeline(): void {
    this._playbackState.value = 'stopped';
    this.transport.pause();
  }

  // Raw numeric comparison, not toFixed(1) string equality: a frame that
  // steps over the 0.1s rounding bucket (e.g. transportTime 10.06 vs
  // totalTime 10.0 — "10.1" !== "10.0") could miss the end entirely.
  private isAtEndOfTimeline(): boolean {
    return (
      this._totalTime.value > 0 &&
      this._transportTime.value >= this._totalTime.value
    );
  }
}

export default PlaybackService;
