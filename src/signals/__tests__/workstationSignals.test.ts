import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  pixelsPerSecond,
  resetWorkstationSignals,
  setZoom,
  zoomIn,
  zoomOut,
} from '../workstationSignals';

afterEach(() => {
  resetWorkstationSignals();
});

describe('zoomIn', () => {
  it('increases pixelsPerSecond', () => {
    const before = pixelsPerSecond.value;

    zoomIn();

    expect(pixelsPerSecond.value).toBeGreaterThan(before);
  });

  it('clamps at maximum', () => {
    pixelsPerSecond.value = MAX_PIXELS_PER_SECOND;

    zoomIn();

    expect(pixelsPerSecond.value).toBe(MAX_PIXELS_PER_SECOND);
  });
});

describe('zoomOut', () => {
  it('decreases pixelsPerSecond', () => {
    const before = pixelsPerSecond.value;

    zoomOut();

    expect(pixelsPerSecond.value).toBeLessThan(before);
  });

  it('clamps at minimum', () => {
    pixelsPerSecond.value = MIN_PIXELS_PER_SECOND;

    zoomOut();

    expect(pixelsPerSecond.value).toBe(MIN_PIXELS_PER_SECOND);
  });
});

describe('setZoom', () => {
  it('sets pixelsPerSecond to the given value', () => {
    setZoom(400);

    expect(pixelsPerSecond.value).toBe(400);
  });

  it('clamps below minimum', () => {
    setZoom(10);

    expect(pixelsPerSecond.value).toBe(MIN_PIXELS_PER_SECOND);
  });

  it('clamps above maximum', () => {
    setZoom(2000);

    expect(pixelsPerSecond.value).toBe(MAX_PIXELS_PER_SECOND);
  });
});
