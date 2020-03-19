module 'startaudiocontext' {
  export default function StartAudioContext(
    context: Context,
    elements?: Array | String | Element | jQuery,
    callback?: Function
  );
}

interface Window {
  TONE_SILENCE_LOGGING: boolean;
}

namespace Tone {
  interface Transport {
    toggle();
  }
  class Channel {
    toMaster();
  }
  interface Context {
    decodeAudioData(buffer: ArrayBuffer): Promise<any>;
  }
  function setContext(context: BaseContext | AnyAudioContext): void;
  function start(): Promise<any>;
}
