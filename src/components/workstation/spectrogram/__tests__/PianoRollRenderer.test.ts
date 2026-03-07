import { type MelodyNote } from '../../../../services/MelodyExtractor';
import {
  drawPianoRoll,
  midiNoteToBin,
  type PianoRollViewport,
} from '../PianoRollRenderer';

// ---------------------------------------------------------------------------
// midiNoteToBin
// ---------------------------------------------------------------------------

describe('midiNoteToBin', () => {
  it('maps C1 (MIDI 24) to bin 0', () => {
    // C1 = 32.7 Hz, bin = 24 × log2(32.7 / 32.7) = 0
    expect(midiNoteToBin(24)).toBeCloseTo(0, 0);
  });

  it('maps C2 (MIDI 36) to bin 24', () => {
    // C2 = 65.4 Hz, one octave above C1 → bin 24
    expect(midiNoteToBin(36)).toBeCloseTo(24, 0);
  });

  it('maps A4 (MIDI 69) to the expected bin', () => {
    // A4 = 440 Hz, bin = 24 × log2(440 / 32.7) ≈ 88.7
    const bin = midiNoteToBin(69);
    expect(bin).toBeCloseTo(24 * Math.log2(440 / 32.7), 1);
  });

  it('increases by 2 bins per semitone', () => {
    // 24 bins/octave ÷ 12 semitones = 2 bins per semitone
    const binA = midiNoteToBin(60); // C4
    const binB = midiNoteToBin(61); // C#4
    expect(binB - binA).toBeCloseTo(2, 1);
  });
});

// ---------------------------------------------------------------------------
// drawPianoRoll
// ---------------------------------------------------------------------------

describe('drawPianoRoll', () => {
  const color = { r: 100, g: 200, b: 150 };

  function createMockCtx() {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  }

  function makeViewport(
    overrides: Partial<PianoRollViewport> = {},
  ): PianoRollViewport {
    return {
      pixelsPerSecond: 200,
      contentOffset: 0,
      viewportWidth: 800,
      canvasHeight: 128,
      frequencyBinCount: 192,
      ...overrides,
    };
  }

  it('does not draw when notes array is empty', () => {
    const ctx = createMockCtx();
    drawPianoRoll(ctx, [], color, makeViewport());
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('does not draw when frequencyBinCount is zero', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 0,
      endTime: 1,
      midiNote: 60,
      confidence: 0.9,
    };
    drawPianoRoll(ctx, [note], color, makeViewport({ frequencyBinCount: 0 }));
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws a note block within the viewport', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 0.5,
      endTime: 1.0,
      midiNote: 60,
      confidence: 0.9,
    };

    drawPianoRoll(ctx, [note], color, makeViewport());

    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('culls notes entirely before the viewport', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 0,
      endTime: 0.5,
      midiNote: 60,
      confidence: 0.9,
    };

    // Viewport starts at 2 seconds (contentOffset = 400px at 200 pps)
    drawPianoRoll(ctx, [note], color, makeViewport({ contentOffset: 400 }));

    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('culls notes entirely after the viewport', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 10,
      endTime: 11,
      midiNote: 60,
      confidence: 0.9,
    };

    // Viewport covers 0–4 seconds (800px / 200 pps)
    drawPianoRoll(ctx, [note], color, makeViewport());

    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('draws notes that partially overlap the viewport', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 3.5,
      endTime: 5.0,
      midiNote: 60,
      confidence: 0.9,
    };

    // Viewport covers 0–4 seconds; note starts at 3.5 and extends past 4
    drawPianoRoll(ctx, [note], color, makeViewport());

    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
  });

  it('draws multiple visible notes', () => {
    const ctx = createMockCtx();
    const notes: MelodyNote[] = [
      { startTime: 0, endTime: 0.5, midiNote: 60, confidence: 0.9 },
      { startTime: 1, endTime: 1.5, midiNote: 64, confidence: 0.8 },
      { startTime: 2, endTime: 2.5, midiNote: 67, confidence: 0.7 },
    ];

    drawPianoRoll(ctx, notes, color, makeViewport());

    expect(ctx.beginPath).toHaveBeenCalledTimes(3);
    expect(ctx.fill).toHaveBeenCalledTimes(3);
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });

  it('sets fill style with track color and opacity', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 0,
      endTime: 1,
      midiNote: 60,
      confidence: 0.9,
    };

    drawPianoRoll(ctx, [note], color, makeViewport());

    expect(ctx.fillStyle).toContain('100');
    expect(ctx.fillStyle).toContain('200');
    expect(ctx.fillStyle).toContain('150');
  });

  it('uses roundRect when available', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 0,
      endTime: 1,
      midiNote: 60,
      confidence: 0.9,
    };

    drawPianoRoll(ctx, [note], color, makeViewport());

    expect(ctx.roundRect).toHaveBeenCalledTimes(1);
    expect(ctx.rect).not.toHaveBeenCalled();
  });

  it('falls back to rect when roundRect is unavailable', () => {
    const ctx = createMockCtx();
    // Remove roundRect to simulate older browser
    (ctx as unknown as Record<string, unknown>).roundRect = undefined;

    const note: MelodyNote = {
      startTime: 0,
      endTime: 1,
      midiNote: 60,
      confidence: 0.9,
    };

    drawPianoRoll(ctx, [note], color, makeViewport());

    expect(ctx.rect).toHaveBeenCalledTimes(1);
  });
});
