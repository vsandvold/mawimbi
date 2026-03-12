// AudioService — bootstraps the Tone.js audio context and creates the
// sub-services that encapsulate different audio engine concerns.
//
// PlaybackService, RecordingService, and TrackService each own their
// slice of the audio engine. AudioService ties them together and
// provides the shared Tone.js context and transport.

import * as Tone from 'tone';
import PlaybackService from './PlaybackService';
import RecordingService from './RecordingService';
import TrackService from './TrackService';
import InstrumentClassificationService from './InstrumentClassificationService';
import TranscriptionService from './TranscriptionService';
import SpectrogramCache from './SpectrogramCache';
import WorkletAnalyser from './WorkletAnalyser';

// Reduce scheduling lookahead from the default 0.1s to 0.05s for lower
// recording latency while keeping enough headroom to avoid scheduling glitches
// with many concurrent players (Tone.js issue #711).
const RECORDING_LOOK_AHEAD = 0.05;

function startAudioContext(
  resolve: () => void,
  reject: () => void,
  event: Event,
): void {
  event.preventDefault();
  event.stopPropagation();
  Tone.start().then(resolve).catch(reject);
}

class AudioService {
  readonly playbackService: PlaybackService;
  readonly recordingService: RecordingService;
  readonly trackService: TrackService;
  readonly classificationService: InstrumentClassificationService;
  readonly transcriptionService: TranscriptionService;
  readonly spectrogramCache: SpectrogramCache;

  private static instance: AudioService;

  private constructor() {
    const transport = Tone.getTransport();
    const context = Tone.getContext();

    this.playbackService = new PlaybackService(transport);
    this.recordingService = new RecordingService(transport, context);
    this.trackService = new TrackService(context);
    this.classificationService = new InstrumentClassificationService();
    this.transcriptionService = new TranscriptionService();
    this.spectrogramCache = new SpectrogramCache();

    // Fire-and-forget classification when a track is created
    this.trackService.setOnTrackCreated((trackId, audioBuffer) => {
      this.classificationService.classify(trackId, audioBuffer).catch(() => {
        // Classification failure is non-critical — silently ignored
      });
    });

    // Attempt to initialize the AudioWorklet-based recorder for
    // sample-accurate capture. Falls back to Tone.Recorder silently.
    this.recordingService.initializeWorkletRecorder();

    // Attempt to initialize the AudioWorklet-based loudness analyser.
    // Replaces Tone.Meter on the destination for lower-latency metering.
    // Falls back to Tone.Meter silently if AudioWorklet is unavailable.
    this.initializeWorkletAnalyser();
  }

  private async initializeWorkletAnalyser(): Promise<void> {
    try {
      const rawContext = Tone.getContext().rawContext as AudioContext;
      if (!rawContext.audioWorklet) return;
      const nativeCtx =
        (rawContext as unknown as { _nativeContext?: AudioContext })
          ._nativeContext ?? rawContext;

      const mixerAnalyser = new WorkletAnalyser(nativeCtx);
      await mixerAnalyser.initialize();
      this.trackService.useWorkletAnalyser(mixerAnalyser);

      const micAnalyser = new WorkletAnalyser(nativeCtx);
      await micAnalyser.initialize();
      this.recordingService.useWorkletAnalyser(micAnalyser);
    } catch {
      // AudioWorklet not supported or module failed to load — keep using
      // Tone.Meter as fallback.
    }
  }

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      // Configure the Tone.js context before creating any audio nodes so
      // they share the same context as Tone.getTransport(). Without this,
      // nodes end up on the default context while getTransport() resolves
      // to the custom context. Transport.start() only resumes its own
      // context, so the default context stays suspended and the Recorder's
      // MediaStreamDestination produces no audio data.
      Tone.setContext(
        new Tone.Context({
          latencyHint: 'interactive',
          lookAhead: RECORDING_LOOK_AHEAD,
        }),
      );
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  static startAudio(clickElement = window): Promise<void> {
    return new Promise((resolve, reject) => {
      clickElement.addEventListener(
        'click',
        (event) => startAudioContext(resolve, reject, event),
        { once: true },
      );
    });
  }

  getDestination(): Tone.ToneAudioNode {
    return Tone.getDestination();
  }
}

export default AudioService;
