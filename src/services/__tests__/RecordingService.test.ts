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
});
