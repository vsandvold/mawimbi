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
// `x = (1 − u)·W`. The ribbon follows its pitch contour all the way to both
// edges — no end anchoring — while the centre line stays the *resting*
// position, which the signal returns to via `presence` when it drops below
// the noise floor. Width tracks loudness, and **opacity tracks volume the
// way the spectrogram's own colour map does** (`SpectrogramTileRenderer`:
// the track colour at full saturation, alpha proportional to magnitude),
// carried per column through the gradient's own stops. The packet wobble of
// spec 009 Decision 1 is scaled by `wobble`, which defaults to 0.
//
// **Horizontal scale is `pixelsPerSecond`** — the same pinch-to-zoom signal
// the runway uses (`workstationSignals`), so one gesture governs the rate of
// change on the time axis in both views and the melody bars stay locked to
// the ribbon at every zoom level.
//
// Two additive passes (`lighter` glow, then `screen` core) on a near-black
// ground, then the transcribed notes as neuron-style pulses. Additive is
// what a mixture of sources actually does — overlapping translucent ribbons
// under `source-over` muddy toward grey, under `lighter` they brighten
// where they coincide.

import { midiNoteToBin } from '../spectrogram/PianoRollRenderer';
import { maxChromaCached, oklchToRgb } from './oklch';
import { BAND_COUNT, sampleEnvelope } from './envelopes';
import { type RibbonTrack } from './RibbonSources';
import {
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

/** Neuron pulse: the glowing head's radius, and its halo multiple. */
const PULSE_CORE_RADIUS_PX = 2.2;
const PULSE_HALO_MULTIPLE = 4;

/** Segments per pulse trace — enough to hug the ribbon's own curve. */
const PULSE_TRACE_SAMPLES = 10;

/** Trace line width, in px. Thin: it runs *inside* the ribbon. */
const PULSE_TRACE_WIDTH_PX = 1.2;

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
  /** Smoothed loudness per column — the gradient's own alpha. */
  columnLevel: Float32Array;
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
    columnLevel: new Float32Array(count),
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
  const { us, displacement, centre, halfWidth, columnLevel } = buffer;

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

    // No end anchoring: the ribbon follows its pitch contour all the way to
    // both edges (owner direction). The centre line is still the *resting*
    // position — `presence` is what returns it there when the signal drops
    // below the noise floor, and that is a property of the signal rather
    // than of where a sample happens to sit on screen.
    const deviation = pitchDeviation(
      lineSample.midi,
      ribbon,
      params,
      laneCount,
    );

    centre[j] =
      centreY -
      deviation * excursion -
      (hasWobble ? displacement[j] * wobbleExcursion : 0);

    halfWidth[j] =
      BASE_HALF_WIDTH_PX +
      lineSample.level * LOUDNESS_HALF_WIDTH_PX * params.thickness;
    columnLevel[j] = lineSample.level;
  }

  // Volume's own contribution to opacity now lives in the gradient's stops,
  // per column, the way the spectrogram's colour map does it. What is left
  // here is the *track's* opacity: the timeline's own tier — muted,
  // focused, drag-target, edit-dimmed or base — times the layer blend,
  // rather than a second dimming vocabulary invented for this view
  // (spec 009 Decision 5).
  const alpha = params.layerAlpha * ribbon.opacity;
  if (alpha <= 0) return;
  // Still per-ribbon: the glow is a bloom around the whole shape, and
  // reading it from the newest column is what makes it pulse with the take
  // rather than smear at a constant brightness.
  const visibility =
    params.silenceFloor + (1 - params.silenceFloor) * clamp01(presenceNow);

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

  // Pass 3 — the transcribed notes as neuron pulses, additive so the head
  // reads as *light* rather than as a sticker laid over the ribbon.
  ctx.globalCompositeOperation = 'lighter';
  drawNeuronPulses(ctx, ribbon, draw);

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
  // No presence term: returning to the centre is the *pitch* gliding home
  // (`buildRibbonLine`), so height stays a function of pitch alone.
  return blended * laneScale;
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
 *
 * **Alpha lives in the stops, not in `globalAlpha`.** The spectrogram's own
 * colour map (`SpectrogramTileRenderer.createColorMap`) is the track colour
 * at constant RGB with alpha proportional to magnitude — silence
 * transparent, loudest opaque — and that is per *pixel*, not per track. A
 * single `globalAlpha` for the whole ribbon cannot express it: the ribbon
 * has to fade where the take is quiet and firm up where it is loud, along
 * its own length. `globalAlpha` is left carrying only the track's timeline
 * opacity and the layer blend.
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
    // The silence floor keeps a quiet ribbon visible rather than letting it
    // vanish — a ribbon is a persistent object, not a trace ("one stream,
    // focusable sources", `kb/product.md`). Above that floor the ramp is
    // the spectrogram's: linear in level.
    const alpha =
      params.silenceFloor +
      (1 - params.silenceFloor) * clamp01(gradientSample.level);
    gradient.addColorStop(u, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`);
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
 * Builds the closed path: top edge, then the bottom edge back.
 *
 * **Quadratic through segment midpoints**, not `lineTo`. A polyline over
 * `N` samples of a contour shows every sample as a corner, and at the
 * runway's default zoom the samples are only a couple of pixels apart —
 * which reads as a jagged edge however smooth the underlying series is.
 * Curving through the midpoints (each sample becomes a control point, each
 * midpoint an on-curve point) gives C¹ continuity for one `quadraticCurveTo`
 * per sample, with no extra points and no spline solve.
 *
 * One path per pass rather than per-segment quads, which keeps the fill
 * count at ~2 per ribbon instead of ~480.
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
  const count = us.length;

  const topY = (j: number) => centre[j] - halfWidth[j] * widthMultiple;
  const bottomY = (j: number) => centre[j] + halfWidth[j] * widthMultiple;

  ctx.moveTo(xForAge(us[0], width), topY(0));
  smoothEdge(ctx, us, width, topY, 0, count - 1);
  ctx.lineTo(xForAge(us[count - 1], width), bottomY(count - 1));
  smoothEdge(ctx, us, width, bottomY, count - 1, 0);
  ctx.closePath();
}

/**
 * Curves along one edge between two sample indices, in either direction.
 * Each interior sample is the control point of a quadratic whose endpoint
 * is the midpoint to the next sample.
 */
function smoothEdge(
  ctx: CanvasRenderingContext2D,
  us: Float32Array,
  width: number,
  yAt: (index: number) => number,
  from: number,
  to: number,
): void {
  const step = to > from ? 1 : -1;
  for (let j = from; j !== to; j += step) {
    const next = j + step;
    const x = xForAge(us[j], width);
    const nextX = xForAge(us[next], width);
    const y = yAt(j);
    const nextYValue = yAt(next);
    if (next === to) {
      ctx.quadraticCurveTo(x, y, nextX, nextYValue);
    } else {
      ctx.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextYValue) / 2);
    }
  }
}

/**
 * The transcribed notes as **neuron signal pulses**: a glowing head at each
 * onset, with a trace running behind it *inside* the ribbon for the note's
 * own extent (owner direction).
 *
 * Both the head and the trace ride the ribbon's own centreline rather than
 * the note's quantised pitch, which is what makes them read as something
 * travelling *along* the ribbon instead of a label pinned over it. Timing
 * is still the transcription's: the head sits exactly at the onset's age,
 * so it enters at the right edge the instant the note is struck and ages
 * leftward with everything else.
 *
 * Alpha carries `note.confidence`, so a shaky detection looks shaky, and
 * the whole pass is additive — a pulse is light in the ribbon, not paint
 * on top of it.
 */
function drawNeuronPulses(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonTrack,
  draw: DrawContext,
): void {
  const { T, params, viewport, history, buffer } = draw;
  if (params.noteAlpha <= 0 || ribbon.notes.length === 0) return;

  // Near-white at the head so it reads as a spark regardless of track hue,
  // tinted back toward the track's own colour along the trace.
  const head = oklchToRgb({ l: 0.97, c: 0.02, h: ribbon.hue });
  const tint = oklchToRgb({
    l: Math.min(0.92, params.lightMax + 0.06),
    c: Math.min(params.chromaMax, maxChromaCached(0.8, ribbon.hue)),
    h: ribbon.hue,
  });

  ctx.lineWidth = PULSE_TRACE_WIDTH_PX * params.pulseSize;
  ctx.lineCap = 'round';

  for (const note of ribbon.notes) {
    if (note.confidence < params.noteConfidence) continue;
    // Gated on the same tonality criterion the line is: if the ribbon will
    // not accept a fundamental here, the overlay must not assert one
    // either. Without this, a click track — broadband, so Basic Pitch
    // reports several simultaneous low pitches per hit — sprays pulses
    // nowhere near a ribbon that is correctly holding still, which reads as
    // exactly the noise this geometry exists to remove.
    if (
      sampleEnvelope(
        ribbon.envelopes.flatness,
        ribbon.envelopes,
        note.startTime,
      ) >= params.tonality
    ) {
      continue;
    }

    // `u` is age, so the onset's head is at the *smaller* u (newer, further
    // right) and the trace runs back toward the note's end.
    const uHead = (T - (note.startTime + ribbon.startTime)) / history;
    const uTail = (T - (note.endTime + ribbon.startTime)) / history;
    if (uHead < 0 || uTail > 1) continue;

    const alpha = params.noteAlpha * clamp01(note.confidence);
    if (alpha <= 0) continue;

    // Trace first, so the head's halo lands on top of it.
    const traceStart = clamp01(Math.min(uHead, uTail));
    const traceEnd = clamp01(Math.max(uHead, uTail));
    if (traceEnd - traceStart > 1e-4) {
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = `rgb(${tint.r}, ${tint.g}, ${tint.b})`;
      ctx.beginPath();
      for (let s = 0; s <= PULSE_TRACE_SAMPLES; s++) {
        const u =
          traceStart + ((traceEnd - traceStart) * s) / PULSE_TRACE_SAMPLES;
        const x = xForAge(u, viewport.width);
        const y = centreAtAge(buffer, u);
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      draw.stats.fills++;
    }

    if (uHead > 1) continue;
    const headX = xForAge(uHead, viewport.width);
    const headY = centreAtAge(buffer, uHead);
    const radius = PULSE_CORE_RADIUS_PX * params.pulseSize;

    // A radial gradient rather than two stacked circles: the halo has to
    // fall off continuously or the pulse reads as a ring.
    const halo = ctx.createRadialGradient(
      headX,
      headY,
      0,
      headX,
      headY,
      radius * PULSE_HALO_MULTIPLE,
    );
    halo.addColorStop(0, `rgba(${head.r}, ${head.g}, ${head.b}, 1)`);
    halo.addColorStop(0.25, `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0.45)`);
    halo.addColorStop(1, `rgba(${tint.r}, ${tint.g}, ${tint.b}, 0)`);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(headX, headY, radius * PULSE_HALO_MULTIPLE, 0, Math.PI * 2);
    ctx.fill();
    draw.stats.fills++;
  }
}

/**
 * The ribbon's own centreline at an arbitrary age, interpolated from the
 * `centre` buffer the geometry pass just filled. Pulses ride this rather
 * than re-deriving a position, so they cannot drift off the ribbon.
 */
function centreAtAge(buffer: EdgeBuffers, u: number): number {
  const { us, centre } = buffer;
  const last = us.length - 1;
  const position = clamp01(u) * last;
  const lower = Math.min(last, Math.floor(position));
  const upper = Math.min(last, lower + 1);
  const t = position - lower;
  return centre[lower] + (centre[upper] - centre[lower]) * t;
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
