// SPIKE (mawimbi#593) — Canvas 2D ribbon stack (spec 009 Decision 2).
//
// Canvas 2D rather than WebGL, and the decisive argument is verification,
// not performance: this repo proves an overlay actually painted by reading
// the canvas backing store with `getImageData` inside `page.evaluate`
// (#569, #570, #571, #572), which is 2D-context-specific. On WebGL it
// becomes `readPixels` with `preserveDrawingBuffer` and same-frame timing —
// a real cost on the first view in this app with no pixel-level tests to
// inherit, and a second rendering stack (context-loss handling included)
// introduced in the same change as a new visualization.
//
// Two additive passes (`lighter` glow, then `screen` core) on a near-black
// ground, then note bars in a third `source-over` pass. Additive is what a
// mixture of sources actually does — overlapping translucent ribbons under
// `source-over` muddy toward grey, under `lighter` they brighten where they
// coincide. The bars must *not* be additive: they would blow out wherever
// they cross the ribbon, which is everywhere they matter.

import { midiNoteToBin } from '../spectrogram/PianoRollRenderer';
import { maxChromaCached, oklchToRgb } from './oklch';
import { BAND_COUNT, sampleEnvelope } from './envelopes';
import { type RibbonTrack } from './RibbonSources';
import {
  anchorEnvelope,
  displacementAt,
  makeSamplePositions,
  normalizePitch,
  PITCH_MAX_MIDI,
  PITCH_MIN_MIDI,
} from './ribbonPropagation';
import { type StringParams } from './stringParams';

/** Colour stops along the ribbon's long axis. */
const GRADIENT_STOPS = 32;

/** Base ribbon half-width in px before loudness, and the loudness gain. */
const BASE_HALF_WIDTH_PX = 0.8;
const LOUDNESS_HALF_WIDTH_PX = 14;

/** Thickness never collapses to nothing at the anchors (the prototype's 25%). */
const THICKNESS_ANCHOR_FLOOR = 0.25;

/** Glow pass width multiple and its alpha coefficient. */
const GLOW_WIDTH_MULTIPLE = 2.4;
const GLOW_ALPHA_COEFFICIENT = 0.085;

/** Alpha floor/span applied on top of the silence floor. */
const ALPHA_FLOOR = 0.35;
const ALPHA_SPAN = 0.65;

/** Opacity of a track dimmed by edit mode — matches `.timeline__track`'s. */
const EDIT_DIM_OPACITY = 0.35;

const NOTE_BAR_HEIGHT_PX = 3;

/** Below this the effective history is zero and nothing can slide. */
const MIN_HISTORY_SECONDS = 1e-3;

export type RibbonViewport = { width: number; height: number };

export type RibbonDrawStats = {
  /** Filled paths this frame — the metric spike question 6 needs, since
   *  fill count is what actually varies as the parameters are swept. */
  fills: number;
};

type EdgeBuffers = {
  us: Float32Array;
  displacement: Float32Array;
  centre: Float32Array;
  halfWidth: Float32Array;
  /** Reused by the cross-section pass, which re-derives edges per band. */
  bandCentre: Float32Array;
  bandHalfWidth: Float32Array;
};

// Module-level and resized only when `N` changes: `TimelineRenderLoop`
// exists partly to keep the frame loop allocation-free (#541), and these
// are the only sizeable arrays the draw touches.
let buffers: EdgeBuffers | null = null;

function ensureBuffers(count: number): EdgeBuffers {
  if (buffers && buffers.us.length === count) return buffers;
  buffers = {
    us: makeSamplePositions(count),
    displacement: new Float32Array(count),
    centre: new Float32Array(count),
    halfWidth: new Float32Array(count),
    bandCentre: new Float32Array(count),
    bandHalfWidth: new Float32Array(count),
  };
  return buffers;
}

/**
 * Draws every ribbon for one frame and reports the fill count.
 *
 * `T` is the engine time from `playback.getEngineTime()` — never
 * `transportTime`, which is written by the scrubber's animation loop and
 * does not advance outside playback (CLAUDE.md; four bugs came from
 * trusting it: #130, #153, #211, #217).
 */
export function drawRibbons(
  ctx: CanvasRenderingContext2D,
  ribbons: readonly RibbonTrack[],
  T: number,
  params: StringParams,
  viewport: RibbonViewport,
): RibbonDrawStats {
  const stats: RibbonDrawStats = { fills: 0 };
  if (ribbons.length === 0) return stats;

  const pointCount = Math.max(8, Math.round(params.points));
  const buffer = ensureBuffers(pointCount);
  const laneHeight = viewport.height / ribbons.length;
  const history = Math.max(MIN_HISTORY_SECONDS, params.tauMem * params.travel);

  ribbons.forEach((ribbon, index) => {
    drawRibbon(ctx, ribbon, index, ribbons.length, {
      T,
      params,
      viewport,
      buffer,
      laneHeight,
      history,
      stats,
    });
  });

  return stats;
}

type DrawContext = {
  T: number;
  params: StringParams;
  viewport: RibbonViewport;
  buffer: EdgeBuffers;
  laneHeight: number;
  history: number;
  stats: RibbonDrawStats;
};

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  laneIndex: number,
  laneCount: number,
  draw: DrawContext,
): void {
  const { T, params, viewport, buffer, laneHeight, history } = draw;
  const { us, displacement, centre, halfWidth } = buffer;

  displacementAt(us, T, ribbon.input, params, displacement);

  const excursion = params.amplitude * laneHeight;
  let loudnessNow = 0;

  for (let j = 0; j < us.length; j++) {
    const u = us[j];
    // `u` is age: `u = 0` is now, `u = 1` is `τ_mem × travel` ago. The
    // effective history is the product, not `τ_mem` — `travel = 0` is a
    // named state where every point samples the same instant and the
    // ribbon is a pure standing warble (spec 009 Decision 1, [PROTO]).
    const sampledTime = T - u * history;
    const midi = ribbon.input.pitchAt(sampledTime);
    const loudness = ribbon.input.loudnessAt(sampledTime);
    if (j === 0) loudnessNow = loudness;

    centre[j] =
      pitchToY(midi, ribbon, laneIndex, laneCount, params, viewport) -
      displacement[j] * excursion;

    const envelope = anchorEnvelope(u, params);
    const thicknessEnvelope =
      THICKNESS_ANCHOR_FLOOR + (1 - THICKNESS_ANCHOR_FLOOR) * envelope;
    halfWidth[j] =
      (BASE_HALF_WIDTH_PX +
        loudness * LOUDNESS_HALF_WIDTH_PX * params.thickness) *
      thicknessEnvelope;
  }

  // `f_floor` is a *silence* floor, not a retirement threshold: a silent
  // ribbon still renders and never disappears, because a ribbon is a
  // persistent object rather than a trace that comes and goes — a track
  // vanishing from the stack is a stronger claim than a track going quiet
  // ("one stream, focusable sources", `kb/product.md`).
  const visibility =
    params.silenceFloor + (1 - params.silenceFloor) * clamp01(loudnessNow);
  const dim = ribbon.isDimmed ? EDIT_DIM_OPACITY : 1;
  const alpha =
    params.layerAlpha * (ALPHA_FLOOR + ALPHA_SPAN * visibility) * dim;

  const gradient = buildGradient(ctx, ribbon, draw, viewport);

  // Pass 1 — glow.
  if (params.glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha =
      GLOW_ALPHA_COEFFICIENT * params.glow * visibility * visibility * dim;
    ctx.fillStyle = gradient;
    tracePath(ctx, us, centre, halfWidth, viewport.width, GLOW_WIDTH_MULTIPLE);
    ctx.fill();
    draw.stats.fills++;
  }

  // Pass 2 — core, optionally split into cross-section bands.
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;
  // A silent frame normalizes to an all-zero band vector, and every band
  // would then be skipped — leaving the ribbon with *no* core fill at all,
  // which contradicts the silence floor's whole point (a ribbon is a
  // persistent object, not a trace). Fall back to the plain core fill.
  const bands = params.bandGradient > 0 ? ribbon.bandsAt(T) : null;
  if (bands && bands.length >= BAND_COUNT && hasBandEnergy(bands)) {
    drawCrossSection(ctx, ribbon, draw, bands, gradient, alpha);
  } else {
    ctx.fillStyle = gradient;
    tracePath(ctx, us, centre, halfWidth, viewport.width, 1);
    ctx.fill();
    draw.stats.fills++;
  }

  // Pass 3 — note bars, never additive.
  ctx.globalCompositeOperation = 'source-over';
  drawNoteBars(ctx, ribbon, draw, laneIndex, laneCount, dim);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function hasBandEnergy(bands: Uint8Array): boolean {
  for (let band = 0; band < BAND_COUNT; band++) {
    if (bands[band] > 0) return true;
  }
  return false;
}

/**
 * Splits the core fill into `BAND_COUNT` stacked sub-ribbons across the
 * local thickness, so the cross-section carries the normalized spectral
 * gradient (spec 009 open question 10, [RWF]).
 *
 * `bandGradient = 1` modulates alpha (which reads as lightness under the
 * additive pass), `= 2` modulates chroma — the variant that avoids stacking
 * a second lightness channel on top of the one already carrying pitch.
 * This is the fill count the HUD's `fills/frame` visibly moves with.
 */
function drawCrossSection(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  draw: DrawContext,
  bands: Uint8Array,
  gradient: CanvasGradient,
  alpha: number,
): void {
  const { buffer, viewport, params, T } = draw;
  const { us, centre, halfWidth, bandCentre, bandHalfWidth } = buffer;
  const useChroma = params.bandGradient >= 2;

  for (let band = 0; band < BAND_COUNT; band++) {
    const energy = bands[band] / 255;
    if (energy <= 0) continue;
    // Band 0 is the lowest content and sits at the bottom edge.
    const inner = band / BAND_COUNT;
    const outer = (band + 1) / BAND_COUNT;
    for (let j = 0; j < us.length; j++) {
      const top = centre[j] - halfWidth[j];
      const bottom = centre[j] + halfWidth[j];
      const bandTop = bottom + (top - bottom) * outer;
      const bandBottom = bottom + (top - bottom) * inner;
      bandCentre[j] = (bandTop + bandBottom) / 2;
      bandHalfWidth[j] = Math.abs(bandBottom - bandTop) / 2;
    }
    if (useChroma) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bandChromaColour(ribbon, draw, energy, T);
    } else {
      ctx.globalAlpha = alpha * energy;
      ctx.fillStyle = gradient;
    }
    tracePath(ctx, us, bandCentre, bandHalfWidth, viewport.width, 1);
    ctx.fill();
    draw.stats.fills++;
  }
}

function bandChromaColour(
  ribbon: RibbonTrack,
  draw: DrawContext,
  energy: number,
  T: number,
): string {
  const { params } = draw;
  const lightness = lightnessAt(ribbon, T, params);
  const chroma = Math.min(
    params.chromaMax * energy,
    maxChromaCached(lightness, ribbon.hue),
  );
  const { r, g, b } = oklchToRgb({ l: lightness, c: chroma, h: ribbon.hue });
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * One `createLinearGradient` along the ribbon's long axis with
 * `GRADIENT_STOPS` stops — 2 gradients and 2 fills per ribbon per frame
 * rather than the per-segment quads (240 × 2 per ribbon) the prototype
 * draws. The quantization is invisible for a smooth lightness ramp across
 * a few hundred pixels.
 */
function buildGradient(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  draw: DrawContext,
  viewport: RibbonViewport,
): CanvasGradient {
  const { T, params, history } = draw;
  const gradient = ctx.createLinearGradient(0, 0, viewport.width, 0);

  for (let stop = 0; stop < GRADIENT_STOPS; stop++) {
    const u = stop / (GRADIENT_STOPS - 1);
    const sampledTime = T - u * history;
    const lightness = lightnessAt(ribbon, sampledTime, params);
    const loudness = ribbon.input.loudnessAt(sampledTime);
    // Chroma carries loudness; lightness stays free of it. The prototype
    // multiplies lightness by loudness too, which makes a quiet high note
    // both dark *and* thin — the invisibility failure again (spec 009
    // channel table, [PROTO]).
    const chroma = Math.min(
      params.chromaMax * (0.2 + 0.8 * clamp01(loudness)),
      maxChromaCached(lightness, ribbon.hue),
    );
    const { r, g, b } = oklchToRgb({ l: lightness, c: chroma, h: ribbon.hue });
    gradient.addColorStop(u, `rgb(${r}, ${g}, ${b})`);
  }
  return gradient;
}

/**
 * Lightness, from pitch or from timbral brightness.
 *
 * Spec 009's first draft resolved the pitch/brightness collision by
 * substitution (pitch when a note is active, centroid otherwise); the
 * prototype ships a global toggle and defaults to *timbre*, the opposite
 * precedence. Exposed as `lightFromTimbre` rather than hardcoded — spike
 * question 11 is which one viewers report as "the sound going up".
 */
function lightnessAt(
  ribbon: RibbonTrack,
  time: number,
  params: StringParams,
): number {
  const span = params.lightMax - params.lightMin;
  if (params.lightFromTimbre >= 1) {
    const trackTime = time - ribbon.startTime;
    const centroid = sampleEnvelope(
      ribbon.envelopes.centroid,
      ribbon.envelopes,
      trackTime,
    );
    const normalized = clamp01(
      centroid / Math.max(1, ribbon.envelopes.binCount),
    );
    return params.lightMin + span * normalized;
  }
  const midi = ribbon.input.pitchAt(time);
  return params.lightMin + span * normalizePitch(midi);
}

/**
 * MIDI → screen y, interpolating `d_sep` between a **shared absolute pitch
 * axis** (0, tracks overlap and the actual voicing is visible) and
 * **per-track normalized lanes** (1, each contour legible regardless of
 * register). Not spacing — spec 009 open question 12.
 *
 * The pitch→position mapping goes through `midiNoteToBin` so it cannot
 * drift from the note bars', which is the #197/#218/#220/#230 class.
 */
function pitchToY(
  midi: number,
  ribbon: RibbonTrack,
  laneIndex: number,
  laneCount: number,
  params: StringParams,
  viewport: RibbonViewport,
): number {
  const safeMidi = Number.isNaN(midi) ? PITCH_MIN_MIDI : midi;

  const sharedLow = midiNoteToBin(PITCH_MIN_MIDI);
  const sharedHigh = midiNoteToBin(PITCH_MAX_MIDI);
  const bin = midiNoteToBin(safeMidi);
  const sharedFraction = clamp01((bin - sharedLow) / (sharedHigh - sharedLow));
  const sharedY = viewport.height * (1 - sharedFraction);

  const laneLow = midiNoteToBin(ribbon.pitchLo);
  const laneHigh = midiNoteToBin(ribbon.pitchHi);
  const laneFraction = clamp01((bin - laneLow) / (laneHigh - laneLow));
  const laneHeight = viewport.height / laneCount;
  const laneY = laneIndex * laneHeight + laneHeight * (1 - laneFraction);

  return sharedY + (laneY - sharedY) * clamp01(params.laneSep);
}

/**
 * Builds the closed path: top edge left→right, bottom edge right→left.
 * One path per pass rather than per-segment quads, which is what keeps the
 * fill count at ~2 per ribbon instead of ~480.
 */
function tracePath(
  ctx: CanvasRenderingContext2D,
  us: Float32Array,
  centre: Float32Array,
  halfWidth: Float32Array,
  width: number,
  widthMultiple: number,
): void {
  ctx.beginPath();
  for (let j = 0; j < us.length; j++) {
    const x = us[j] * width;
    const y = centre[j] - halfWidth[j] * widthMultiple;
    if (j === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let j = us.length - 1; j >= 0; j--) {
    ctx.lineTo(us[j] * width, centre[j] + halfWidth[j] * widthMultiple);
  }
  ctx.closePath();
}

/**
 * Note bars: the categorisation layer, drawn at the note's own quantised
 * height while the ribbon (locked to `midiNote + pitchBend`) sits near but
 * not on it. The gap between them is the performance.
 *
 * Alpha carries `note.confidence`, so a shaky detection looks shaky —
 * locking is a claim that the transcription is right, and this is how that
 * claim stays honest.
 */
function drawNoteBars(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  draw: DrawContext,
  laneIndex: number,
  laneCount: number,
  dim: number,
): void {
  const { T, params, viewport, history } = draw;
  if (params.noteAlpha <= 0 || ribbon.notes.length === 0) return;

  const { r, g, b } = oklchToRgb({
    l: Math.min(0.95, params.lightMax + 0.06),
    c: 0,
    h: ribbon.hue,
  });

  for (const note of ribbon.notes) {
    const noteStart = note.startTime + ribbon.startTime;
    const noteEnd = note.endTime + ribbon.startTime;
    // `u` is age, so a note occupies a sliding span that moves rightward
    // and exits at u = 1.
    const uStart = (T - noteEnd) / history;
    const uEnd = (T - noteStart) / history;
    if (uEnd < 0 || uStart > 1) continue;

    const x0 = clamp01(uStart) * viewport.width;
    const x1 = clamp01(uEnd) * viewport.width;
    if (x1 - x0 < 0.5) continue;

    const y = pitchToY(
      note.midiNote,
      ribbon,
      laneIndex,
      laneCount,
      params,
      viewport,
    );
    ctx.globalAlpha = params.noteAlpha * clamp01(note.confidence) * dim;
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x0, y - NOTE_BAR_HEIGHT_PX / 2, x1 - x0, NOTE_BAR_HEIGHT_PX);
    draw.stats.fills++;
  }
}

/**
 * `NaN`-safe: a silent frame has no pitch, and an unguarded `NaN` reaching
 * `addColorStop` as `rgb(NaN, NaN, NaN)` throws — taking down the shared
 * render loop's whole frame, not just this ribbon.
 */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
