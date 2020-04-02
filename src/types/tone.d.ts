import 'tone';

declare module 'tone' {
  function start(): Promise<any>;
  function setContext(context: BaseContext | AnyAudioContext): void;

  interface Context {
    decodeAudioData(buffer: ArrayBuffer): Promise<any>;
  }

  class Channel {
    volume: Param;
    mute: boolean;
    solo: boolean;
    dispose();
    toMaster();
  }
}
