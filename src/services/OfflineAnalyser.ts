import { analyseCQTFromAudioBuffer } from './CQTAnalyser';
import {
  applyLogFrequencyMapping,
  createLogFrequencyMapping,
} from './logFrequencyMapping';

export type SpectrogramData = {
  frequencyFrames: Uint8Array[];
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
};

class OfflineAnalyser {
  readonly frequencyBinCount: number;
  readonly timeResolution: number;

  private analyser: AnalyserNode;
  private audioBuffer: AudioBuffer;
  private isContextSuspendSupported: boolean;
  private offlineContext: OfflineAudioContext;
  private offlineContextSuspendTime = 0.025;
  private scriptProcessorBufferLength = 1024; // = 0.46, or 1024 = 0.023
  private logFrequencyMapping: number[][];
  private frequencyDataCopy: Uint8Array;

  constructor(audioBuffer: AudioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const bufferLength = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    const offlineContext = new window.OfflineAudioContext(
      numChannels,
      bufferLength,
      sampleRate,
    );
    const analyser = this.createAnalyser(offlineContext);
    const isContextSuspendSupported =
      this.detectContextSuspendSupported(offlineContext);

    this.audioBuffer = audioBuffer;
    this.analyser = analyser;
    this.frequencyBinCount = analyser.frequencyBinCount;
    this.isContextSuspendSupported = isContextSuspendSupported;
    this.offlineContext = offlineContext;
    this.timeResolution = isContextSuspendSupported
      ? this.offlineContextSuspendTime
      : this.scriptProcessorBufferLength / sampleRate;
    this.logFrequencyMapping = createLogFrequencyMapping(
      analyser.frequencyBinCount,
    );
    this.frequencyDataCopy = new Uint8Array(this.frequencyBinCount);
  }

  private createAnalyser(offlineContext: OfflineAudioContext) {
    const analyser = offlineContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    analyser.minDecibels = -80;
    analyser.maxDecibels = -30;
    return analyser;
  }

  private detectContextSuspendSupported(offlineContext: OfflineAudioContext) {
    return 'suspend' in offlineContext;
  }

  getFrequencyData(
    callback: (frequencyData: Uint8Array, currentTime: number) => void,
  ): Promise<AudioBuffer> {
    if (this.isContextSuspendSupported) {
      return this.getFrequencyDataSuspendContext(callback);
    } else {
      return this.getFrequencyDataScriptProcessor(callback);
    }
  }

  getLogarithmicFrequencyData(
    callback: (frequencyData: Uint8Array, currentTime: number) => void,
  ): Promise<AudioBuffer> {
    return this.getFrequencyData(
      (frequencyData: Uint8Array, currentTime: number) => {
        callback(
          this.transformFrequencies(frequencyData, this.logFrequencyMapping),
          currentTime,
        );
      },
    );
  }

  /**
   * Constant-Q Transform analysis producing log-frequency spectrogram frames.
   *
   * Delegates to the CQT analyser which computes a true Constant-Q
   * Transform with uniform Q-factor across all frequency bins. This
   * replaces the previous multi-band STFT pipeline, eliminating band
   * seams and providing mathematically correct log-frequency spacing.
   */
  analyseToFrames(): SpectrogramData {
    return analyseCQTFromAudioBuffer(this.audioBuffer);
  }

  private getFrequencyDataSuspendContext(
    callback: (frequencyData: Uint8Array, currentTime: number) => void,
  ): Promise<AudioBuffer> {
    const bufferSource = this.offlineContext.createBufferSource();

    bufferSource.connect(this.analyser);
    this.analyser.connect(this.offlineContext.destination);

    const frequencyData = new Uint8Array(this.frequencyBinCount);

    const suspendCallback = () => {
      this.analyser.getByteFrequencyData(frequencyData);
      callback(frequencyData, this.offlineContext.currentTime);
      this.offlineContext.resume();
    };

    const step = this.timeResolution;
    let suspendTime = step;
    while (suspendTime < this.audioBuffer.duration) {
      this.offlineContext
        .suspend(suspendTime)
        .then(suspendCallback)
        .catch((error) => console.log(error));
      suspendTime += step;
    }

    bufferSource.buffer = this.audioBuffer;
    bufferSource.start(0);

    return this.offlineContext.startRendering();
  }

  private getFrequencyDataScriptProcessor(
    callback: (frequencyData: Uint8Array, currentTime: number) => void,
  ): Promise<AudioBuffer> {
    const bufferSource = this.offlineContext.createBufferSource();

    const scriptProcessor = this.offlineContext.createScriptProcessor(
      this.scriptProcessorBufferLength,
      this.analyser.numberOfOutputs,
      this.analyser.numberOfOutputs,
    );

    bufferSource.connect(this.analyser);
    this.analyser.connect(scriptProcessor);
    scriptProcessor.connect(this.offlineContext.destination);

    const frequencyData = new Uint8Array(this.frequencyBinCount);

    scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      this.analyser.getByteFrequencyData(frequencyData);
      callback(frequencyData, event.playbackTime);
    };

    bufferSource.buffer = this.audioBuffer;
    bufferSource.start(0);

    return this.offlineContext.startRendering();
  }

  private transformFrequencies(
    frequencyData: Uint8Array,
    frequencyMapping: number[][],
  ) {
    this.frequencyDataCopy.set(frequencyData);
    applyLogFrequencyMapping(
      this.frequencyDataCopy,
      frequencyMapping,
      frequencyData,
    );
    return frequencyData;
  }
}

export default OfflineAnalyser;
