namespace Tone {
    interface Context {
        decodeAudioData(buffer: ArrayBuffer): Promise<any>;
    }
}
