import {
  BAND_CONFIGS,
  type BandMergeInfo,
  calculateMultiBandMergeParams,
  createMergedLogMapping,
} from './dualBandAnalysis';
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

type FilterSpec = {
  type: BiquadFilterType;
  frequency: number;
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

  private createBandAnalyser(
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
   * Multi-band FFT analysis producing log-frequency spectrogram frames.
   *
   * Splits the signal into four bands with geometrically spaced boundaries
   * (0–320 Hz, 320–1280 Hz, 1280–5120 Hz, 5120–Nyquist), each analysed
   * in a separate OfflineAudioContext at a sample rate and FFT size chosen
   * to approximate constant-Q resolution. The bands are merged and
   * log-frequency mapped into a single spectrogram.
   */
  async analyseToFrames(): Promise<SpectrogramData> {
    const { audioBuffer } = this;
    const sampleRate = audioBuffer.sampleRate;

    const bandFrames = await Promise.all(
      BAND_CONFIGS.map((config, i) => {
        const sr = config.sampleRate || sampleRate;
        const filters = buildFilters(i);
        return this.analyseBand(sr, filters, config.fftSize);
      }),
    );

    const params = calculateMultiBandMergeParams(sampleRate);
    const { bands, mergedBinCount } = params;

    const logMapping = createMergedLogMapping(sampleRate);
    const frameCount = Math.min(...bandFrames.map((f) => f.length));
    const frequencyFrames: Uint8Array[] = [];
    const mergedData = new Uint8Array(mergedBinCount);
    const tempBuffer = new Uint8Array(mergedBinCount);

    for (let f = 0; f < frameCount; f++) {
      mergeBands(mergedData, bandFrames, bands, f);
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
    filters: FilterSpec[],
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

    // Build filter chain
    const filterNodes = filters.map((spec) => {
      const filter = context.createBiquadFilter();
      filter.type = spec.type;
      filter.frequency.value = spec.frequency;
      return filter;
    });

    const analyser = this.createBandAnalyser(context, fftSize);

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

    // Wire: source → filter[0] → ... → filter[N-1] → analyser
    if (filterNodes.length === 0) {
      bufferSource.connect(analyser);
    } else {
      bufferSource.connect(filterNodes[0]);
      for (let i = 1; i < filterNodes.length; i++) {
        filterNodes[i - 1].connect(filterNodes[i]);
      }
      filterNodes[filterNodes.length - 1].connect(analyser);
    }

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the filter specs for a band by index.
 *
 * - First band: lowpass only
 * - Last band: highpass only
 * - Middle bands: highpass + lowpass
 */
function buildFilters(bandIndex: number): FilterSpec[] {
  const config = BAND_CONFIGS[bandIndex];
  const filters: FilterSpec[] = [];
  if (config.lowerFreq > 0) {
    filters.push({ type: 'highpass', frequency: config.lowerFreq });
  }
  if (config.upperFreq > 0) {
    filters.push({ type: 'lowpass', frequency: config.upperFreq });
  }
  return filters;
}

/**
 * Copies the relevant FFT bins from each band's frame into the
 * merged array.
 */
function mergeBands(
  merged: Uint8Array,
  bandFrames: Uint8Array[][],
  bands: BandMergeInfo[],
  frameIndex: number,
): void {
  let offset = 0;
  for (let b = 0; b < bands.length; b++) {
    const band = bands[b];
    const frame = bandFrames[b][frameIndex];
    for (let i = 0; i < band.binCount; i++) {
      merged[offset + i] = frame[band.startBin + i];
    }
    offset += band.binCount;
  }
}

export default OfflineAnalyser;
