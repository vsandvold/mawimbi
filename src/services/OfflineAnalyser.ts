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

    const offlineContext = new (window.OfflineAudioContext ||
      window.webkitOfflineAudioContext)(numChannels, bufferLength, sampleRate);
    const analyser = this.createAnalyser(offlineContext);
    const isContextSuspendSupported = this.detectContextSuspendSupported(
      offlineContext
    );

    this.audioBuffer = audioBuffer;
    this.analyser = analyser;
    this.frequencyBinCount = analyser.frequencyBinCount;
    this.isContextSuspendSupported = isContextSuspendSupported;
    this.offlineContext = offlineContext;
    this.timeResolution = isContextSuspendSupported
      ? this.offlineContextSuspendTime
      : this.scriptProcessorBufferLength / sampleRate;
    this.logFrequencyMapping = this.createLogFrequencyMapping();
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
    const isSafari = window.hasOwnProperty('webkitOfflineAudioContext');
    return 'suspend' in offlineContext && !isSafari;
  }

  getFrequencyData(
    callback: (frequencyData: Uint8Array, currentTime: number) => void
  ): Promise<AudioBuffer> {
    if (this.isContextSuspendSupported) {
      return this.getFrequencyDataSuspendContext(callback);
    } else {
      return this.getFrequencyDataScriptProcessor(callback);
    }
  }

  getLogarithmicFrequencyData(
    callback: (frequencyData: Uint8Array, currentTime: number) => void
  ): Promise<AudioBuffer> {
    return this.getFrequencyData(
      (frequencyData: Uint8Array, currentTime: number) => {
        callback(
          this.transformFrequencies(frequencyData, this.logFrequencyMapping),
          currentTime
        );
      }
    );
  }

  private getFrequencyDataSuspendContext(
    callback: (frequencyData: Uint8Array, currentTime: number) => void
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
    callback: (frequencyData: Uint8Array, currentTime: number) => void
  ): Promise<AudioBuffer> {
    const bufferSource = this.offlineContext.createBufferSource();

    const scriptProcessor = this.offlineContext.createScriptProcessor(
      this.scriptProcessorBufferLength,
      this.analyser.numberOfOutputs,
      this.analyser.numberOfOutputs
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

  private createLogFrequencyMapping() {
    const logFrequencyMapping: number[][] = new Array(this.frequencyBinCount);
    const lower = 1;
    const upper = this.frequencyBinCount + 1;
    const b = Math.log(lower / upper) / (lower - upper);
    const a = 1; // lower / Math.exp(b * lower);
    for (let i = 0, binCount = this.frequencyBinCount; i < binCount; i++) {
      const logIdx = Math.trunc(a * Math.exp(b * i)) - 1;
      logFrequencyMapping[i] = [logIdx];
    }
    for (
      let i = 0, binCountDec = this.frequencyBinCount - 1;
      i < binCountDec;
      i++
    ) {
      const df = logFrequencyMapping[i + 1][0] - logFrequencyMapping[i][0];
      if (df === 1) {
        continue;
      }
      for (let j = 1; j <= df; j++) {
        logFrequencyMapping[i].push(logFrequencyMapping[i][0] + j);
      }
    }
    return logFrequencyMapping;
  }

  private transformFrequencies(
    frequencyData: Uint8Array,
    frequencyMapping: number[][]
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
