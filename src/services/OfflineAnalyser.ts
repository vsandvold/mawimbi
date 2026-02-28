import { createLogFrequencyMapping } from './logFrequencyMapping';

export type SpectrogramData = {
  frequencyFrames: Uint8Array[];
  timeResolution: number;
  frequencyBinCount: number;
  sampleRate: number;
  duration: number;
};

const DUAL_BAND_FFT_SIZE = 1024;
const SPLIT_FREQUENCY = 752;

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

  private createDualBandAnalyser(offlineContext: OfflineAudioContext) {
    const analyser = offlineContext.createAnalyser();
    analyser.fftSize = DUAL_BAND_FFT_SIZE;
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

  async analyseToFrames(): Promise<SpectrogramData> {
    const { audioBuffer } = this;
    const sampleRate = audioBuffer.sampleRate;

    // Fresh context — OfflineAudioContext.startRendering() is single-use
    const offlineContext = new window.OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      sampleRate,
    );

    const lowpassFilter = offlineContext.createBiquadFilter();
    lowpassFilter.type = 'lowpass';
    lowpassFilter.frequency.value = SPLIT_FREQUENCY;

    const highpassFilter = offlineContext.createBiquadFilter();
    highpassFilter.type = 'highpass';
    highpassFilter.frequency.value = SPLIT_FREQUENCY;

    const analyserLow = this.createDualBandAnalyser(offlineContext);
    const analyserHigh = this.createDualBandAnalyser(offlineContext);
    const supportsSuspend = this.detectContextSuspendSupported(offlineContext);

    const binCount = analyserLow.frequencyBinCount;
    const splitBin = Math.round(
      SPLIT_FREQUENCY / (sampleRate / DUAL_BAND_FFT_SIZE),
    );
    const logMapping = createLogFrequencyMapping(binCount);

    const timeResolution = supportsSuspend
      ? this.offlineContextSuspendTime
      : this.scriptProcessorBufferLength / sampleRate;

    const frequencyFrames: Uint8Array[] = [];
    const lowData = new Uint8Array(binCount);
    const highData = new Uint8Array(binCount);
    const mergedData = new Uint8Array(binCount);
    const tempBuffer = new Uint8Array(binCount);

    const collectFrame = () => {
      analyserLow.getByteFrequencyData(lowData);
      analyserHigh.getByteFrequencyData(highData);

      for (let i = 0; i < binCount; i++) {
        mergedData[i] = i < splitBin ? lowData[i] : highData[i];
      }

      for (let i = 0; i < binCount; i++) {
        tempBuffer[i] = mergedData[i];
      }
      for (let i = 0; i < binCount; i++) {
        mergedData[i] = 0;
        const pool = logMapping[i];
        for (let j = 0; j < pool.length; j++) {
          mergedData[i] += tempBuffer[pool[j]];
        }
      }
      frequencyFrames.push(new Uint8Array(mergedData));
    };

    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = audioBuffer;

    if (supportsSuspend) {
      bufferSource.connect(lowpassFilter);
      bufferSource.connect(highpassFilter);
      lowpassFilter.connect(analyserLow);
      highpassFilter.connect(analyserHigh);
      analyserLow.connect(offlineContext.destination);
      analyserHigh.connect(offlineContext.destination);

      const step = timeResolution;
      let suspendTime = step;
      while (suspendTime < audioBuffer.duration) {
        offlineContext
          .suspend(suspendTime)
          .then(() => {
            collectFrame();
            offlineContext.resume();
          })
          .catch((error) => console.log(error));
        suspendTime += step;
      }

      bufferSource.start(0);
      await offlineContext.startRendering();
    } else {
      const scriptProcessor = offlineContext.createScriptProcessor(
        this.scriptProcessorBufferLength,
        analyserLow.numberOfOutputs,
        analyserLow.numberOfOutputs,
      );

      bufferSource.connect(lowpassFilter);
      bufferSource.connect(highpassFilter);
      lowpassFilter.connect(analyserLow);
      highpassFilter.connect(analyserHigh);
      analyserLow.connect(scriptProcessor);
      scriptProcessor.connect(offlineContext.destination);
      analyserHigh.connect(offlineContext.destination);

      scriptProcessor.onaudioprocess = () => {
        collectFrame();
      };

      bufferSource.start(0);
      await offlineContext.startRendering();
    }

    return {
      frequencyFrames,
      timeResolution,
      frequencyBinCount: binCount,
      sampleRate,
      duration: audioBuffer.duration,
    };
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
    for (let i = 0, binCount = this.frequencyBinCount; i < binCount; i++) {
      this.frequencyDataCopy[i] = frequencyData[i];
    }
    for (let i = 0, binCount = this.frequencyBinCount; i < binCount; i++) {
      frequencyData[i] = 0;
      for (
        let j = 0, poolCount = frequencyMapping[i].length;
        j < poolCount;
        j++
      ) {
        frequencyData[i] += this.frequencyDataCopy[frequencyMapping[i][j]];
      }
    }
    return frequencyData;
  }
}

export default OfflineAnalyser;
