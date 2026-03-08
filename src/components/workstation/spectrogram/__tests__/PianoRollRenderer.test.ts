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

  function createMockGradient() {
    return {
      addColorStop: vi.fn(),
    };
  }

  function createMockCtx() {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      shadowColor: '',
      shadowBlur: 0,
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(() => createMockGradient()),
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

    // Each note: beginPath for body + fill + stroke, then beginPath for highlight + stroke
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.createLinearGradient).toHaveBeenCalled();
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

    expect(ctx.fill).toHaveBeenCalled();
  });

  it('draws multiple visible notes', () => {
    const ctx = createMockCtx();
    const notes: MelodyNote[] = [
      { startTime: 0, endTime: 0.5, midiNote: 60, confidence: 0.9 },
      { startTime: 1, endTime: 1.5, midiNote: 64, confidence: 0.8 },
      { startTime: 2, endTime: 2.5, midiNote: 67, confidence: 0.7 },
    ];

    drawPianoRoll(ctx, notes, color, makeViewport());

    // Each note creates a gradient
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(3);
  });

  it('creates gradient fill with track color for 3D effect', () => {
    const ctx = createMockCtx();
    const gradient = createMockGradient();
    (ctx.createLinearGradient as ReturnType<typeof vi.fn>).mockReturnValue(
      gradient,
    );

    const note: MelodyNote = {
      startTime: 0,
      endTime: 1,
      midiNote: 60,
      confidence: 0.9,
    };

    drawPianoRoll(ctx, [note], color, makeViewport());

    expect(ctx.createLinearGradient).toHaveBeenCalled();
    // Gradient has two stops: lighter top and darker bottom
    expect(gradient.addColorStop).toHaveBeenCalledTimes(2);
    expect(gradient.addColorStop).toHaveBeenCalledWith(
      0,
      expect.stringContaining('rgba('),
    );
    expect(gradient.addColorStop).toHaveBeenCalledWith(
      1,
      expect.stringContaining('rgba('),
    );
  });

  it('draws top highlight line for 3D bevel', () => {
    const ctx = createMockCtx();
    const note: MelodyNote = {
      startTime: 0,
      endTime: 1,
      midiNote: 60,
      confidence: 0.9,
    };

    drawPianoRoll(ctx, [note], color, makeViewport());

    // Top highlight uses moveTo/lineTo
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
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

    expect(ctx.roundRect).toHaveBeenCalled();
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

    expect(ctx.rect).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Playhead glow effect
  // ---------------------------------------------------------------------------

  describe('playhead glow', () => {
    it('applies glow effect to notes intersecting the playhead', () => {
      const ctx = createMockCtx();
      const note: MelodyNote = {
        startTime: 1.0,
        endTime: 2.0,
        midiNote: 60,
        confidence: 0.9,
      };

      drawPianoRoll(ctx, [note], color, makeViewport({ playheadTime: 1.5 }));

      // Active notes use save/restore for glow shadow
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('does not apply glow when playhead is outside note range', () => {
      const ctx = createMockCtx();
      const note: MelodyNote = {
        startTime: 1.0,
        endTime: 2.0,
        midiNote: 60,
        confidence: 0.9,
      };

      drawPianoRoll(ctx, [note], color, makeViewport({ playheadTime: 0.5 }));

      // No save/restore means no glow was applied
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('does not apply glow when playheadTime is undefined', () => {
      const ctx = createMockCtx();
      const note: MelodyNote = {
        startTime: 0,
        endTime: 1,
        midiNote: 60,
        confidence: 0.9,
      };

      drawPianoRoll(
        ctx,
        [note],
        color,
        makeViewport({ playheadTime: undefined }),
      );

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('applies glow only to the note under the playhead', () => {
      const ctx = createMockCtx();
      const notes: MelodyNote[] = [
        { startTime: 0, endTime: 1, midiNote: 60, confidence: 0.9 },
        { startTime: 1, endTime: 2, midiNote: 64, confidence: 0.8 },
        { startTime: 2, endTime: 3, midiNote: 67, confidence: 0.7 },
      ];

      drawPianoRoll(ctx, notes, color, makeViewport({ playheadTime: 1.5 }));

      // Only the second note (1.0–2.0) intersects playhead at 1.5
      expect(ctx.save).toHaveBeenCalledTimes(1);
      expect(ctx.restore).toHaveBeenCalledTimes(1);
    });
  });
});
