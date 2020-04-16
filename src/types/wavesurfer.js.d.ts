declare module 'wavesurfer.js' {
  export default class WaveSurfer {
    static create(params: WavesurferParams): WaveSurfer;
    loadDecodedBuffer(buffer: AudioBuffer): void;
    destroy(): void;
  }
}
