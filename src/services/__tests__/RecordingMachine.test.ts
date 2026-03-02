import {
  arm,
  disarm,
  isActivelyRecording,
  isArmed,
  isCountingIn,
  isIdle,
  isTransportLocked,
  recordingState,
  resetRecordingMachine,
  startCountIn,
  startRecording,
  stopCountIn,
  stopRecording,
  toggleArm,
} from '../RecordingMachine';

afterEach(() => {
  resetRecordingMachine();
});

describe('RecordingMachine', () => {
  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(recordingState.value).toBe('idle');
    });

    it('reports isIdle as true', () => {
      expect(isIdle()).toBe(true);
    });

    it('is not counting in', () => {
      expect(isCountingIn.value).toBe(false);
    });
  });

  describe('arm', () => {
    it('transitions from idle to armed', () => {
      arm();

      expect(recordingState.value).toBe('armed');
      expect(isArmed()).toBe(true);
    });

    it('is a no-op when already armed', () => {
      arm();

      arm();

      expect(recordingState.value).toBe('armed');
    });

    it('is a no-op when recording', () => {
      arm();
      startRecording();

      arm();

      expect(recordingState.value).toBe('recording');
    });
  });

  describe('disarm', () => {
    it('transitions from armed to idle', () => {
      arm();

      disarm();

      expect(recordingState.value).toBe('idle');
      expect(isIdle()).toBe(true);
    });

    it('is a no-op when idle', () => {
      disarm();

      expect(recordingState.value).toBe('idle');
    });

    it('is a no-op when recording', () => {
      arm();
      startRecording();

      disarm();

      expect(recordingState.value).toBe('recording');
    });
  });

  describe('startRecording', () => {
    it('transitions from armed to recording', () => {
      arm();

      startRecording();

      expect(recordingState.value).toBe('recording');
      expect(isActivelyRecording()).toBe(true);
    });

    it('is a no-op when idle', () => {
      startRecording();

      expect(recordingState.value).toBe('idle');
    });

    it('is a no-op when already recording', () => {
      arm();
      startRecording();

      startRecording();

      expect(recordingState.value).toBe('recording');
    });
  });

  describe('stopRecording', () => {
    it('transitions from recording to idle', () => {
      arm();
      startRecording();

      stopRecording();

      expect(recordingState.value).toBe('idle');
      expect(isIdle()).toBe(true);
    });

    it('is a no-op when idle', () => {
      stopRecording();

      expect(recordingState.value).toBe('idle');
    });

    it('is a no-op when armed', () => {
      arm();

      stopRecording();

      expect(recordingState.value).toBe('armed');
    });
  });

  describe('toggleArm', () => {
    it('arms when idle', () => {
      toggleArm();

      expect(recordingState.value).toBe('armed');
    });

    it('disarms when armed', () => {
      arm();

      toggleArm();

      expect(recordingState.value).toBe('idle');
    });

    it('is a no-op when recording', () => {
      arm();
      startRecording();

      toggleArm();

      expect(recordingState.value).toBe('recording');
    });
  });

  describe('count-in', () => {
    it('starts count-in', () => {
      startCountIn();

      expect(isCountingIn.value).toBe(true);
    });

    it('stops count-in', () => {
      startCountIn();

      stopCountIn();

      expect(isCountingIn.value).toBe(false);
    });
  });

  describe('isTransportLocked', () => {
    it('is false when idle', () => {
      expect(isTransportLocked()).toBe(false);
    });

    it('is false when armed', () => {
      arm();

      expect(isTransportLocked()).toBe(false);
    });

    it('is true when recording', () => {
      arm();
      startRecording();

      expect(isTransportLocked()).toBe(true);
    });

    it('is true during count-in', () => {
      startCountIn();

      expect(isTransportLocked()).toBe(true);
    });
  });

  describe('resetRecordingMachine', () => {
    it('resets all state to defaults', () => {
      arm();
      startRecording();
      startCountIn();

      resetRecordingMachine();

      expect(recordingState.value).toBe('idle');
      expect(isCountingIn.value).toBe(false);
    });
  });
});
