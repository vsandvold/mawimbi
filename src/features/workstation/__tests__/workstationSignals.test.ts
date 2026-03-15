import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  getPixelsPerSecond,
  setZoom,
  resetWorkstationSignals,
  zoomIn,
  zoomOut,
} from '../workstationSignals';

afterEach(() => {
  resetWorkstationSignals();
});

describe('zoomIn', () => {
  it('increases pixelsPerSecond', () => {
    const before = getPixelsPerSecond();

    zoomIn();

    expect(getPixelsPerSecond()).toBeGreaterThan(before);
  });

  it('clamps at maximum', () => {
    setZoom(MAX_PIXELS_PER_SECOND);

    zoomIn();

    expect(getPixelsPerSecond()).toBe(MAX_PIXELS_PER_SECOND);
  });
});

describe('zoomOut', () => {
  it('decreases pixelsPerSecond', () => {
    const before = getPixelsPerSecond();

    zoomOut();

    expect(getPixelsPerSecond()).toBeLessThan(before);
  });

  it('clamps at minimum', () => {
    setZoom(MIN_PIXELS_PER_SECOND);

    zoomOut();

    expect(getPixelsPerSecond()).toBe(MIN_PIXELS_PER_SECOND);
  });
});

describe('setZoom', () => {
  it('sets pixelsPerSecond to the given value', () => {
    setZoom(400);

    expect(getPixelsPerSecond()).toBe(400);
  });

  it('clamps below minimum', () => {
    setZoom(10);

    expect(getPixelsPerSecond()).toBe(MIN_PIXELS_PER_SECOND);
  });

  it('clamps above maximum', () => {
    setZoom(2000);

    expect(getPixelsPerSecond()).toBe(MAX_PIXELS_PER_SECOND);
  });
});
