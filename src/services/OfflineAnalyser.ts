import {
  applyLogFrequencyMapping,
  createDualBandLogMapping,
  createLogFrequencyMapping,
} from './logFrequencyMapping';

export type SpectrogramData = {
  frequencyFrames: Uint8Array[];
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
};

const LOW_BAND_FFT_SIZE = 2048;
const HIGH_BAND_FFT_SIZE = 1024;
const SPLIT_FREQUENCY = 752;
const LOW_BAND_SAMPLE_RATE = 5120;

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

  private createDualBandAnalyser(
    offlineContext: OfflineAudioContext,
    fftSize: number,
  ) {
    const analyser = offlineContext.createAnalyser();
    analyser.fftSize = fftSize;
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
   * Dual-band FFT analysis producing log-frequency spectrogram frames.
   *
   * Splits the signal at ~752 Hz with separate OfflineAudioContexts:
   * the low band runs at 5120 Hz with a 2048-point FFT for ~4× finer
   * frequency resolution in the bass range (301 bins vs 70), achieving
   * semitone discrimination down to ~42 Hz. The high band runs at the
   * original sample rate with a 1024-point FFT. The two bands are merged
   * and log-frequency mapped into a single spectrogram.
   */
  async analyseToFrames(): Promise<SpectrogramData> {
    const { audioBuffer } = this;
    const sampleRate = audioBuffer.sampleRate;

    const lowFrames = await this.analyseBand(
      LOW_BAND_SAMPLE_RATE,
      'lowpass',
      LOW_BAND_FFT_SIZE,
    );
    const highFrames = await this.analyseBand(
      sampleRate,
      'highpass',
      HIGH_BAND_FFT_SIZE,
    );

    const lowBinWidth = LOW_BAND_SAMPLE_RATE / LOW_BAND_FFT_SIZE;
    const highBinWidth = sampleRate / HIGH_BAND_FFT_SIZE;
    const lowBinCount = Math.ceil(SPLIT_FREQUENCY / lowBinWidth);
    const highBinStart = Math.ceil(SPLIT_FREQUENCY / highBinWidth);
    const highBinEnd = HIGH_BAND_FFT_SIZE / 2;
    const mergedBinCount = lowBinCount + (highBinEnd - highBinStart);

    const logMapping = createDualBandLogMapping(
      mergedBinCount,
      lowBinCount,
      lowBinWidth,
      highBinStart,
      highBinWidth,
    );
    const frameCount = Math.min(lowFrames.length, highFrames.length);
    const frequencyFrames: Uint8Array[] = [];
    const mergedData = new Uint8Array(mergedBinCount);
    const tempBuffer = new Uint8Array(mergedBinCount);

    for (let f = 0; f < frameCount; f++) {
      for (let i = 0; i < lowBinCount; i++) {
        mergedData[i] = lowFrames[f][i];
      }
      for (let i = highBinStart; i < highBinEnd; i++) {
        mergedData[lowBinCount + i - highBinStart] = highFrames[f][i];
      }

      tempBuffer.set(mergedData);
      applyLogFrequencyMapping(tempBuffer, logMapping, mergedData);
      frequencyFrames.push(new Uint8Array(mergedData));
    }

    const timeResolution = this.isContextSuspendSupported
      ? this.offlineContextSuspendTime
      : this.scriptProcessorBufferLength / sampleRate;

    return {
      frequencyFrames,
      timeResolution,
      frequencyBinCount: mergedBinCount,
      sampleRate,
      duration: audioBuffer.duration,
    };
  }

  /**
   * Runs FFT analysis on a single frequency band, collecting raw frequency
   * frames at regular intervals.
   *
   * A new AudioBuffer is created at the original sample rate inside a context
   * running at `contextSampleRate`. When these differ (e.g. 5120 Hz for the
   * low band), the OfflineAudioContext automatically resamples during playback,
   * concentrating the FFT bins into a narrower frequency range.
   */
  private async analyseBand(
    contextSampleRate: number,
    filterType: BiquadFilterType,
    fftSize: number,
  ): Promise<Uint8Array[]> {
    const { audioBuffer } = this;
    const numChannels = audioBuffer.numberOfChannels;
    const duration = audioBuffer.duration;
    const contextLength = Math.ceil(duration * contextSampleRate);

    const context = new window.OfflineAudioContext(
      numChannels,
      contextLength,
      contextSampleRate,
    );

    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = SPLIT_FREQUENCY;

    const analyser = this.createDualBandAnalyser(context, fftSize);

    const newBuffer = context.createBuffer(
      numChannels,
      audioBuffer.length,
      audioBuffer.sampleRate,
    );
    for (let ch = 0; ch < numChannels; ch++) {
      newBuffer.copyToChannel(audioBuffer.getChannelData(ch), ch);
    }

    const bufferSource = context.createBufferSource();
    bufferSource.buffer = newBuffer;
    bufferSource.connect(filter);
    filter.connect(analyser);

    const binCount = analyser.frequencyBinCount;
    const frames: Uint8Array[] = [];
    const frequencyData = new Uint8Array(binCount);

    const supportsSuspend = this.detectContextSuspendSupported(context);

    if (supportsSuspend) {
      analyser.connect(context.destination);

      const step = this.offlineContextSuspendTime;
      let suspendTime = step;
      while (suspendTime < duration) {
        context
          .suspend(suspendTime)
          .then(() => {
            analyser.getByteFrequencyData(frequencyData);
            frames.push(new Uint8Array(frequencyData));
            context.resume();
          })
          .catch((error) => console.log(error));
        suspendTime += step;
      }
    } else {
      const scriptProcessor = context.createScriptProcessor(
        this.scriptProcessorBufferLength,
        analyser.numberOfOutputs,
        analyser.numberOfOutputs,
      );

      analyser.connect(scriptProcessor);
      scriptProcessor.connect(context.destination);

      scriptProcessor.onaudioprocess = () => {
        analyser.getByteFrequencyData(frequencyData);
        frames.push(new Uint8Array(frequencyData));
      };
    }

    bufferSource.start(0);
    await context.startRendering();

    return frames;
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
