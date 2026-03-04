import * as Tone from 'tone';
import RecordingService from '../RecordingService';

let service: RecordingService;

beforeEach(() => {
  const transport = Tone.getTransport();
  transport.seconds = 0;
  vi.mocked(transport.start).mockClear();
  vi.mocked(transport.stop).mockClear();
  vi.mocked(transport.pause).mockClear();
  service = new RecordingService(transport, Tone.context);
});

// jsdom doesn't implement AudioBuffer constructor — provide a minimal stub
// so LatencyCompensation.trimBuffer() can create trimmed buffers.
const OriginalAudioBuffer = globalThis.AudioBuffer;

beforeAll(() => {
  globalThis.AudioBuffer = class MockAudioBuffer {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    duration: number;
    private channels: Float32Array[];

    constructor(options: {
      numberOfChannels: number;
      length: number;
      sampleRate: number;
    }) {
      this.numberOfChannels = options.numberOfChannels;
      this.length = options.length;
      this.sampleRate = options.sampleRate;
      this.duration = options.length / options.sampleRate;
      this.channels = [];
      for (let ch = 0; ch < options.numberOfChannels; ch++) {
        this.channels.push(new Float32Array(options.length));
      }
    }

    getChannelData(ch: number): Float32Array {
      return this.channels[ch];
    }
  } as unknown as typeof AudioBuffer;
});

afterAll(() => {
  globalThis.AudioBuffer = OriginalAudioBuffer;
});

function createMockBuffer(length: number, sampleRate = 44100): AudioBuffer {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = i / length;
  }
  return {
    numberOfChannels: 1,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('RecordingService', () => {
  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(service.recordingState).toBe('idle');
    });

    it('reports isIdle as true', () => {
      expect(service.isIdle()).toBe(true);
    });

    it('is not counting in', () => {
      expect(service.isCountingIn).toBe(false);
    });

    it('reports isRecording as false', () => {
      expect(service.isRecording).toBe(false);
    });
  });

  describe('arm', () => {
    it('transitions from idle to armed', () => {
      service.arm();

      expect(service.recordingState).toBe('armed');
      expect(service.isArmed()).toBe(true);
    });

    it('is a no-op when already armed', () => {
      service.arm();

      service.arm();

      expect(service.recordingState).toBe('armed');
    });

    it('is a no-op when recording', () => {
      service.arm();
      service.startRecording();

      service.arm();

      expect(service.recordingState).toBe('recording');
    });
  });

  describe('disarm', () => {
    it('transitions from armed to idle', () => {
      service.arm();

      service.disarm();

      expect(service.recordingState).toBe('idle');
      expect(service.isIdle()).toBe(true);
    });

    it('is a no-op when idle', () => {
      service.disarm();

      expect(service.recordingState).toBe('idle');
    });

    it('is a no-op when recording', () => {
      service.arm();
      service.startRecording();

      service.disarm();

      expect(service.recordingState).toBe('recording');
    });
  });

  describe('startRecording', () => {
    it('transitions from armed to recording', () => {
      service.arm();

      service.startRecording();

      expect(service.recordingState).toBe('recording');
      expect(service.isActivelyRecording()).toBe(true);
    });

    it('is a no-op when idle', () => {
      service.startRecording();

      expect(service.recordingState).toBe('idle');
    });

    it('is a no-op when already recording', () => {
      service.arm();
      service.startRecording();

      service.startRecording();

      expect(service.recordingState).toBe('recording');
    });
  });

  describe('stopRecording', () => {
    it('transitions from recording to idle', () => {
      service.arm();
      service.startRecording();

      service.stopRecording();

      expect(service.recordingState).toBe('idle');
      expect(service.isIdle()).toBe(true);
    });

    it('is a no-op when idle', () => {
      service.stopRecording();

      expect(service.recordingState).toBe('idle');
    });

    it('is a no-op when armed', () => {
      service.arm();

      service.stopRecording();

      expect(service.recordingState).toBe('armed');
    });
  });

  describe('toggleArm', () => {
    it('arms when idle', () => {
      service.toggleArm();

      expect(service.recordingState).toBe('armed');
    });

    it('disarms when armed', () => {
      service.arm();

      service.toggleArm();

      expect(service.recordingState).toBe('idle');
    });

    it('is a no-op when recording', () => {
      service.arm();
      service.startRecording();

      service.toggleArm();

      expect(service.recordingState).toBe('recording');
    });
  });

  describe('count-in', () => {
    it('starts count-in', () => {
      service.startCountIn();

      expect(service.isCountingIn).toBe(true);
    });

    it('stops count-in', () => {
      service.startCountIn();

      service.stopCountIn();

      expect(service.isCountingIn).toBe(false);
    });
  });

  describe('isTransportLocked', () => {
    it('is false when idle', () => {
      expect(service.isTransportLocked()).toBe(false);
    });

    it('is false when armed', () => {
      service.arm();

      expect(service.isTransportLocked()).toBe(false);
    });

    it('is true when recording', () => {
      service.arm();
      service.startRecording();

      expect(service.isTransportLocked()).toBe(true);
    });

    it('is true during count-in', () => {
      service.startCountIn();

      expect(service.isTransportLocked()).toBe(true);
    });
  });

  describe('isRecording computed signal', () => {
    it('is true when armed', () => {
      service.arm();

      expect(service.isRecording).toBe(true);
    });

    it('is true when recording', () => {
      service.arm();
      service.startRecording();

      expect(service.isRecording).toBe(true);
    });

    it('is true during count-in', () => {
      service.startCountIn();

      expect(service.isRecording).toBe(true);
    });

    it('is false when idle and not counting in', () => {
      expect(service.isRecording).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', () => {
      service.arm();
      service.startRecording();
      service.startCountIn();

      service.reset();

      expect(service.recordingState).toBe('idle');
      expect(service.isCountingIn).toBe(false);
    });
  });

  describe('stopOverdubRecording', () => {
    it('trims the recorded buffer by the latency compensation', async () => {
      const sampleRate = 44100;
      const rawLength = sampleRate; // 1 second of audio
      const rawBuffer = createMockBuffer(rawLength, sampleRate);
      vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(rawBuffer);

      await service.startOverdubRecording();
      const result = await service.stopOverdubRecording();

      const compensation = service.estimateRoundTripLatency();
      const expectedTrim = Math.floor(compensation * sampleRate);
      expect(result.audioBuffer.length).toBe(rawLength - expectedTrim);
    });

    it('returns an arrayBuffer that matches the trimmed audioBuffer', async () => {
      const sampleRate = 44100;
      const rawBuffer = createMockBuffer(sampleRate, sampleRate);
      vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(rawBuffer);

      await service.startOverdubRecording();
      const result = await service.stopOverdubRecording();

      // Mono Float32: 4 bytes per sample
      const expectedBytes = result.audioBuffer.length * 1 * 4;
      expect(result.arrayBuffer.byteLength).toBe(expectedBytes);
    });

    it('preserves the original startTime from when recording began', async () => {
      const transport = Tone.getTransport();
      transport.seconds = 5.0;
      service = new RecordingService(transport, Tone.context);
      const rawBuffer = createMockBuffer(44100);
      vi.mocked(Tone.context.decodeAudioData).mockResolvedValueOnce(rawBuffer);

      await service.startOverdubRecording();
      const result = await service.stopOverdubRecording();

      expect(result.startTime).toBe(5.0);
    });
  });
});
