import { dbToByte } from '../spectrogramRenderer';

describe('dbToByte', () => {
  it('returns 0 for values at or below MIN_DB', () => {
    expect(dbToByte(-80)).toBe(0);
    expect(dbToByte(-100)).toBe(0);
  });

  it('returns 255 for values at or above MAX_DB', () => {
    expect(dbToByte(-30)).toBe(255);
    expect(dbToByte(0)).toBe(255);
  });

  it('returns proportional value for mid-range dB', () => {
    // -55 dB is halfway between -80 and -30 → ~128
    expect(dbToByte(-55)).toBe(128);
  });
});
