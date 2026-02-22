import {
  transportTime,
  isPlaying,
  loudness,
  resetTransportSignals,
} from '../transportSignals';

afterEach(() => {
  resetTransportSignals();
});

describe('transportSignals', () => {
  describe('initial values', () => {
    it('has transportTime at 0', () => {
      expect(transportTime.value).toBe(0);
    });

    it('has isPlaying as false', () => {
      expect(isPlaying.value).toBe(false);
    });

    it('has loudness at 0', () => {
      expect(loudness.value).toBe(0);
    });
  });

  describe('signal updates', () => {
    it('allows updating transportTime', () => {
      transportTime.value = 42.5;

      expect(transportTime.value).toBe(42.5);
    });

    it('allows toggling isPlaying', () => {
      isPlaying.value = true;

      expect(isPlaying.value).toBe(true);
    });

    it('allows updating loudness', () => {
      loudness.value = -12;

      expect(loudness.value).toBe(-12);
    });
  });

  describe('resetTransportSignals', () => {
    it('resets all transport signals to defaults', () => {
      transportTime.value = 99;
      isPlaying.value = true;
      loudness.value = -6;

      resetTransportSignals();

      expect(transportTime.value).toBe(0);
      expect(isPlaying.value).toBe(false);
      expect(loudness.value).toBe(0);
    });
  });
});
