declare module 'wavesurfer.js' {
  function create(params: WavesurferParams): WaveSurfer;
  function loadDecodedBuffer(buffer: AudioBuffer): void;
}
