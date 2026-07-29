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
// **Geometry (owner direction, 2026-07-28).** Each ribbon rests as a thin
// straight line down the middle of the screen, all of them layered on one
// centre line. New audio enters at the **right** edge and ages leftward, so
// `x = (1 − u)·W`. Both ends are anchored to the centre line; between them
// the ribbon rises and falls with the signal's fundamental, its width
// tracks loudness, and its colour intensity tracks spectral content. The
// packet wobble of spec 009 Decision 1 is scaled by `wobble`, which
// defaults to 0.
//
// **Horizontal scale is `pixelsPerSecond`** — the same pinch-to-zoom signal
// the runway uses (`workstationSignals`), so one gesture governs the rate of
// change on the time axis in both views and the melody bars stay locked to
// the ribbon at every zoom level.
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
  lineAnchor,
  makeLineSample,
  sampleRibbonLine,
  type RibbonLineSample,
} from './ribbonLine';
import {
  displacementAt,
  makeSamplePositions,
  PITCH_MAX_MIDI,
  PITCH_MIN_MIDI,
} from './ribbonPropagation';
import { type StringParams } from './stringParams';

/** Colour stops along the ribbon's long axis. */
const GRADIENT_STOPS = 32;

/** Resting half-width in px, and how far loudness opens it. */
const BASE_HALF_WIDTH_PX = 0.55;
const LOUDNESS_HALF_WIDTH_PX = 9;

/** Glow pass width multiple and its alpha coefficient. */
const GLOW_WIDTH_MULTIPLE = 2.4;
const GLOW_ALPHA_COEFFICIENT = 0.085;

/** Alpha floor/span applied on top of the silence floor. */
const ALPHA_FLOOR = 0.35;
const ALPHA_SPAN = 0.65;

const NOTE_BAR_HEIGHT_PX = 3;

/** Segments per note bar — enough to follow the anchor shoulder smoothly. */
const NOTE_BAR_SAMPLES = 8;

/** Guard against a zero or absurd zoom producing an infinite history. */
const MIN_PIXELS_PER_SECOND = 1;

export type RibbonViewport = {
  width: number;
  height: number;
  /** The runway's zoom, in px per second — the pinch-to-zoom signal. */
  pixelsPerSecond: number;
};

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
const lineSample: RibbonLineSample = makeLineSample();
const gradientSample: RibbonLineSample = makeLineSample();

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

/** Seconds of history the viewport holds at the current zoom. */
export function historySeconds(viewport: RibbonViewport): number {
  return (
    viewport.width / Math.max(MIN_PIXELS_PER_SECOND, viewport.pixelsPerSecond)
  );
}

/** Age (0 = now) → screen x. Now is the **right** edge; content ages left. */
export function xForAge(u: number, width: number): number {
  return (1 - u) * width;
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
  const history = historySeconds(viewport);

  // Paint order mirrors the timeline's z-index tiers, so a focused or
  // edit-active track sits on top of the stack here exactly as its
  // spectrogram does on the runway. The *lane* index stays the track's own
  // position, so reordering the paint doesn't move anything on screen.
  drawOrder.length = 0;
  for (let i = 0; i < ribbons.length; i++) drawOrder.push(i);
  drawOrder.sort((a, b) => ribbons[a].paintOrder - ribbons[b].paintOrder);

  drawContext.T = T;
  drawContext.params = params;
  drawContext.viewport = viewport;
  drawContext.buffer = buffer;
  drawContext.history = history;
  drawContext.stats = stats;

  for (const index of drawOrder) {
    drawContext.laneIndex = index;
    drawRibbon(ctx, ribbons[index], ribbons.length, drawContext);
  }

  return stats;
}

// Reused across frames — `TimelineRenderLoop` exists partly to keep the
// frame loop allocation-free (#541).
const drawOrder: number[] = [];
const drawContext = {} as DrawContext;

type DrawContext = {
  T: number;
  params: StringParams;
  viewport: RibbonViewport;
  buffer: EdgeBuffers;
  history: number;
  stats: RibbonDrawStats;
  laneIndex: number;
};

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  laneCount: number,
  draw: DrawContext,
): void {
  const { T, params, viewport, buffer, history } = draw;
  const { us, displacement, centre, halfWidth } = buffer;

  // The wobble is off by default. Skipping the whole packet sum when it is
  // zero is not just an optimisation: it is what makes "off" mean the line
  // is *exactly* straight at rest rather than straight to within a
  // rounding error.
  const hasWobble = params.wobble > 0;
  if (hasWobble) {
    displacementAt(us, T, ribbon.input, params, displacement);
  }

  const excursion = (params.amplitude * viewport.height) / 2;
  const wobbleExcursion = params.wobble * excursion;
  const centreY = centreYFor(laneCount, draw);
  let presenceNow = 0;

  for (let j = 0; j < us.length; j++) {
    const u = us[j];
    // `u` is age; now is the right edge. The visible span is the viewport
    // width divided by the zoom, so pinching changes how fast the ribbon
    // travels exactly as it does on the runway.
    const sampledTime = T - u * history;
    sampleRibbonLine(ribbon.line, sampledTime - ribbon.startTime, lineSample);
    if (j === 0) presenceNow = lineSample.presence;

    // Both ends are pinned to the centre line; between them the anchor is
    // flat, so what the ribbon draws is the pitch and not an arch.
    const anchor = lineAnchor(u, params.anchorEdge);
    const deviation = pitchDeviation(
      lineSample.midi,
      lineSample.presence,
      ribbon,
      params,
      laneCount,
    );

    centre[j] =
      centreY -
      deviation * excursion * anchor -
      (hasWobble ? displacement[j] * wobbleExcursion : 0);

    halfWidth[j] =
      BASE_HALF_WIDTH_PX +
      lineSample.level * LOUDNESS_HALF_WIDTH_PX * params.thickness;
  }

  // `f_floor` is a *silence* floor, not a retirement threshold: a silent
  // ribbon still renders and never disappears, because a ribbon is a
  // persistent object rather than a trace that comes and goes ("one stream,
  // focusable sources", `kb/product.md`).
  const visibility =
    params.silenceFloor + (1 - params.silenceFloor) * clamp01(presenceNow);
  // The timeline's own opacity for this track — muted, focused,
  // drag-target, edit-dimmed or base — rather than a second dimming
  // vocabulary invented here (spec 009 Decision 5).
  const alpha =
    params.layerAlpha *
    (ALPHA_FLOOR + ALPHA_SPAN * visibility) *
    ribbon.opacity;
  if (alpha <= 0) return;

  const gradient = buildGradient(ctx, ribbon, draw);

  // Pass 1 — glow.
  if (params.glow > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha =
      GLOW_ALPHA_COEFFICIENT *
      params.glow *
      visibility *
      visibility *
      ribbon.opacity;
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
  // which contradicts the silence floor's whole point. Fall back to the
  // plain core fill.
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
  drawNoteBars(ctx, ribbon, draw, laneCount);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * The screen y a ribbon rests at: the middle of the viewport when the
 * ribbons are layered (`laneSep = 0`), its own lane's middle when they are
 * separated (`laneSep = 1`).
 */
function centreYFor(laneCount: number, draw: DrawContext): number {
  const { viewport, params, laneIndex } = draw;
  const middle = viewport.height / 2;
  const laneHeight = viewport.height / Math.max(1, laneCount);
  const laneMiddle = laneIndex * laneHeight + laneHeight / 2;
  return middle + (laneMiddle - middle) * clamp01(params.laneSep);
}

/**
 * Signed deviation from the centre line, −1 (bottom) … +1 (top).
 *
 * `d_sep` interpolates between a **shared absolute pitch axis** (0 — tracks
 * overlap on one line and the actual voicing is visible) and **per-track
 * normalized lanes** (1 — each contour legible regardless of register). Not
 * spacing; spec 009 open question 12.
 *
 * The pitch→position mapping goes through `midiNoteToBin` so it cannot
 * drift from the note bars', which is the #197/#218/#220/#230 class.
 */
export function pitchDeviation(
  midi: number,
  presence: number,
  ribbon: RibbonTrack,
  params: StringParams,
  laneCount: number,
): number {
  const shared = 2 * (binFraction(midi, PITCH_MIN_MIDI, PITCH_MAX_MIDI) - 0.5);
  const lane = 2 * (binFraction(midi, ribbon.pitchLo, ribbon.pitchHi) - 0.5);
  const blended = shared + (lane - shared) * clamp01(params.laneSep);
  // A separated lane only owns 1/N of the height, so its excursion has to
  // shrink with it or neighbouring ribbons overlap at full deflection.
  const laneScale =
    1 + (1 / Math.max(1, laneCount) - 1) * clamp01(params.laneSep);
  // Presence is what returns the line to the middle when the signal drops
  // below the noise floor — smoothly, on the release transient.
  return blended * laneScale * clamp01(presence);
}

function binFraction(midi: number, lo: number, hi: number): number {
  // A non-finite pitch means "no fundamental here", which is the *centre*
  // of the axis — not its bottom. `clamp01(NaN)` is 0, so leaning on it
  // here would slam the ribbon to the lowest pitch on screen whenever the
  // estimate dropped out, which is the opposite of resting.
  if (!Number.isFinite(midi)) return 0.5;
  const low = midiNoteToBin(lo);
  const high = midiNoteToBin(hi);
  if (!(high > low)) return 0.5;
  return clamp01((midiNoteToBin(midi) - low) / (high - low));
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
 * gradient (spec 009 open question 10, [RWF]). Off by default now that
 * colour intensity carries spectral content instead.
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
  sampleRibbonLine(ribbon.line, T - ribbon.startTime, gradientSample);
  const lightness = lightnessOf(gradientSample, params);
  const chroma = Math.min(
    params.chromaMax * energy,
    maxChromaCached(lightness, ribbon.hue),
  );
  const { r, g, b } = oklchToRgb({ l: lightness, c: chroma, h: ribbon.hue });
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * One `createLinearGradient` along the ribbon's long axis, running
 * right-to-left so stop 0 is *now*.
 */
function buildGradient(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  draw: DrawContext,
): CanvasGradient {
  const { T, params, history, viewport } = draw;
  const gradient = ctx.createLinearGradient(viewport.width, 0, 0, 0);

  for (let stop = 0; stop < GRADIENT_STOPS; stop++) {
    const u = stop / (GRADIENT_STOPS - 1);
    const sampledTime = T - u * history;
    sampleRibbonLine(
      ribbon.line,
      sampledTime - ribbon.startTime,
      gradientSample,
    );
    const lightness = lightnessOf(gradientSample, params);
    // Chroma carries loudness; lightness stays free of it. Multiplying
    // lightness by loudness too makes a quiet high note both dark *and*
    // thin — the invisibility failure (spec 009 channel table, [PROTO]).
    const chroma = Math.min(
      params.chromaMax * (0.2 + 0.8 * clamp01(gradientSample.level)),
      maxChromaCached(lightness, ribbon.hue),
    );
    const { r, g, b } = oklchToRgb({ l: lightness, c: chroma, h: ribbon.hue });
    gradient.addColorStop(u, `rgb(${r}, ${g}, ${b})`);
  }
  return gradient;
}

/**
 * Colour intensity, from spectral content by default (owner direction) or
 * from pitch. Spec 009's first draft resolved the pitch/brightness
 * collision by substitution and the prototype shipped a global toggle
 * defaulting to timbre; with height now carrying pitch alone, timbre is
 * the reading that keeps the two channels independent.
 */
function lightnessOf(sample: RibbonLineSample, params: StringParams): number {
  const span = params.lightMax - params.lightMin;
  const source =
    params.lightFromTimbre >= 1 ? sample.brightness : sample.pitch01;
  // A resting ribbon reads as its own dim baseline rather than as whatever
  // the last sound's colour happened to be.
  const intensity = clamp01(source) * clamp01(sample.presence);
  return params.lightMin + span * intensity;
}

/**
 * Builds the closed path: top edge, then the bottom edge back. One path per
 * pass rather than per-segment quads, which keeps the fill count at ~2 per
 * ribbon instead of ~480.
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
    const x = xForAge(us[j], width);
    const y = centre[j] - halfWidth[j] * widthMultiple;
    if (j === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let j = us.length - 1; j >= 0; j--) {
    ctx.lineTo(xForAge(us[j], width), centre[j] + halfWidth[j] * widthMultiple);
  }
  ctx.closePath();
}

/**
 * The transcribed notes, as bars on the same axis as the ribbon: same
 * `age → x` mapping and same `midiNoteToBin` pitch mapping, so a bar and
 * the pitch line it belongs to move together under pinch-zoom and sit at
 * the same height when the ribbon is locked to it.
 *
 * The bar is the categorisation layer, drawn at the note's own quantised
 * pitch; the ribbon is the nuance layer, and the gap between them is the
 * performance. Alpha carries `note.confidence`, so a shaky detection looks
 * shaky — locking is a claim that the transcription is right, and this is
 * how that claim stays honest.
 */
function drawNoteBars(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  draw: DrawContext,
  laneCount: number,
): void {
  const { T, params, viewport, history } = draw;
  if (params.noteAlpha <= 0 || ribbon.notes.length === 0) return;

  const { r, g, b } = oklchToRgb({
    l: Math.min(0.95, params.lightMax + 0.06),
    c: 0,
    h: ribbon.hue,
  });
  const excursion = (params.amplitude * viewport.height) / 2;
  const centreY = centreYFor(laneCount, draw);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

  for (const note of ribbon.notes) {
    if (note.confidence < params.noteConfidence) continue;
    // Gated on the same tonality criterion the line is: if the ribbon will
    // not accept a fundamental here, the overlay must not assert one
    // either. Without this, a click track — broadband, so Basic Pitch
    // reports several simultaneous low pitches per hit — draws a haze of
    // bars nowhere near a ribbon that is correctly holding still, which
    // reads as exactly the noise this geometry exists to remove.
    if (
      sampleEnvelope(
        ribbon.envelopes.flatness,
        ribbon.envelopes,
        note.startTime,
      ) >= params.tonality
    ) {
      continue;
    }
    const noteStart = note.startTime + ribbon.startTime;
    const noteEnd = note.endTime + ribbon.startTime;
    // `u` is age, so a note occupies a sliding span that enters at the
    // right edge and exits at the left.
    const uNewest = clamp01((T - noteStart) / history);
    const uOldest = clamp01((T - noteEnd) / history);
    if ((T - noteStart) / history < 0 || (T - noteEnd) / history > 1) continue;
    if (uNewest - uOldest <= 0) continue;

    const deviation = pitchDeviation(
      note.midiNote,
      1,
      ribbon,
      params,
      laneCount,
    );
    if (
      xForAge(uOldest, viewport.width) - xForAge(uNewest, viewport.width) <
      0.5
    ) {
      continue;
    }

    // Sampled along the bar's own span rather than drawn as one rect: the
    // ribbon is anchored to the centre line at both ends, and a bar
    // crossing that shoulder has to bend with it or the two visibly
    // disagree exactly where the eye is checking them against each other.
    ctx.beginPath();
    for (let s = 0; s <= NOTE_BAR_SAMPLES; s++) {
      const u = uNewest + ((uOldest - uNewest) * s) / NOTE_BAR_SAMPLES;
      const x = xForAge(u, viewport.width);
      const y =
        centreY -
        deviation * excursion * lineAnchor(u, params.anchorEdge) -
        NOTE_BAR_HEIGHT_PX / 2;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let s = NOTE_BAR_SAMPLES; s >= 0; s--) {
      const u = uNewest + ((uOldest - uNewest) * s) / NOTE_BAR_SAMPLES;
      ctx.lineTo(
        xForAge(u, viewport.width),
        centreY -
          deviation * excursion * lineAnchor(u, params.anchorEdge) +
          NOTE_BAR_HEIGHT_PX / 2,
      );
    }
    ctx.closePath();

    ctx.globalAlpha =
      params.noteAlpha * clamp01(note.confidence) * ribbon.opacity;
    ctx.fill();
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
