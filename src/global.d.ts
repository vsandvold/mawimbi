namespace Tone {
  interface Context {
    decodeAudioData(buffer: ArrayBuffer): Promise<any>;
  }
  function setContext(context: BaseContext | AnyAudioContext): void;
}

module 'startaudiocontext' {
  export default function StartAudioContext(
    context: Context,
    elements: Array | String | Element | jQuery,
    callback: Function
  );
}
