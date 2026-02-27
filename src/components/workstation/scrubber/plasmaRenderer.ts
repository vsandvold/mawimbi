import {
  applyLogFrequencyMapping,
  createLogFrequencyMapping,
} from '../../../services/logFrequencyMapping';

// --- dB conversion (matches spectrogramRenderer.ts) ---

const MIN_DB = -80;
const MAX_DB = -30;
const DB_RANGE = MAX_DB - MIN_DB;

// --- Beat detection ---

const EMA_DECAY = 0.05;
const BEAT_THRESHOLD = 1.6;
const BEAT_LOUDNESS_FLOOR = 0.15;
const FLARE_DECAY_RATE = 8;

// --- Etch marks ---

const ETCH_MAX_AGE_MS = 12_000;

// --- Beam layer radii (base values, scaled by loudness + frequency) ---

const CORE_HALF_WIDTH = 1.5;
const INNER_GLOW_RADIUS = 6;
const PLASMA_FIELD_RADIUS = 16;
const OUTER_AURA_RADIUS = 40;

// --- Spark particles ---

const SPARK_COUNT_MIN = 5;
const SPARK_COUNT_MAX = 15;
const SPARK_SPEED_MIN = 40;
const SPARK_SPEED_MAX = 120;
const SPARK_MAX_LIFE = 0.15;

// --- Log-frequency mapping cache ---

let cachedBinCount = 0;
let cachedMapping: number[][] = [];
let cachedLogBuffer: Float32Array = new Float32Array(0);

function getLogMapping(binCount: number): {
  mapping: number[][];
  buffer: Float32Array;
} {
  if (cachedBinCount !== binCount) {
    cachedMapping = createLogFrequencyMapping(binCount);
    cachedLogBuffer = new Float32Array(binCount);
    cachedBinCount = binCount;
  }
  return { mapping: cachedMapping, buffer: cachedLogBuffer };
}

// --- Types ---

export type EtchMark = {
  scrollPx: number;
  intensity: number;
  timestamp: number;
};

export type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
};

export type PlasmaState = {
  loudnessEMA: number;
  flareIntensity: number;
  sparks: Spark[];
  etchMarks: EtchMark[];
  prevLoudness: number;
};

export function createPlasmaState(): PlasmaState {
  return {
    loudnessEMA: 0,
    flareIntensity: 0,
    sparks: [],
    etchMarks: [],
    prevLoudness: 0,
  };
}

// --- Beat detection ---

export function updateBeatDetection(
  state: PlasmaState,
  loudness: number,
  deltaTime: number,
): boolean {
  const alpha = Math.min(1, EMA_DECAY + deltaTime * 2);
  state.loudnessEMA += alpha * (loudness - state.loudnessEMA);

  const ratio = state.loudnessEMA > 0.01 ? loudness / state.loudnessEMA : 0;
  const isBeat = ratio > BEAT_THRESHOLD && loudness > BEAT_LOUDNESS_FLOOR;

  if (isBeat) {
    state.flareIntensity = 1.0;
  }

  state.flareIntensity = Math.max(
    0,
    state.flareIntensity - FLARE_DECAY_RATE * deltaTime,
  );

  state.prevLoudness = loudness;
  return isBeat;
}

// --- Spark management ---

export function spawnSparks(
  state: PlasmaState,
  centerX: number,
  height: number,
  intensity: number,
): void {
  const count =
    SPARK_COUNT_MIN +
    Math.floor(intensity * (SPARK_COUNT_MAX - SPARK_COUNT_MIN));
  for (let i = 0; i < count; i++) {
    const y = Math.random() * height;
    const angle = (Math.random() - 0.5) * Math.PI;
    const speed =
      SPARK_SPEED_MIN + Math.random() * (SPARK_SPEED_MAX - SPARK_SPEED_MIN);
    const life = SPARK_MAX_LIFE * (0.5 + Math.random() * 0.5);
    state.sparks.push({
      x: centerX,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
    });
  }
}

export function updateSparks(state: PlasmaState, deltaTime: number): void {
  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const spark = state.sparks[i];
    spark.x += spark.vx * deltaTime;
    spark.y += spark.vy * deltaTime;
    spark.life -= deltaTime;
    if (spark.life <= 0) {
      state.sparks.splice(i, 1);
    }
  }
}

// --- Etch marks ---

export function stampEtchMark(
  state: PlasmaState,
  scrollPx: number,
  loudness: number,
  now: number,
): void {
  state.etchMarks.push({
    scrollPx,
    intensity: Math.min(1, loudness * 1.5),
    timestamp: now,
  });
}

export function pruneEtchMarks(state: PlasmaState, now: number): void {
  for (let i = state.etchMarks.length - 1; i >= 0; i--) {
    if (now - state.etchMarks[i].timestamp > ETCH_MAX_AGE_MS) {
      state.etchMarks.splice(i, 1);
    }
  }
}

// --- Rendering helpers ---

function dbToByte(db: number): number {
  if (db <= MIN_DB) return 0;
  if (db >= MAX_DB) return 255;
  return ((db - MIN_DB) / DB_RANGE) * 255;
}

/**
 * Convert raw FFT bins (dB) into per-row intensity values (0–1) for the
 * canvas height. Uses log-frequency mapping so low frequencies spread
 * across more rows (bottom) and high frequencies compress (top).
 */
export function getFrequencyIntensities(
  frequencyData: Float32Array | null,
  height: number,
): Float32Array {
  const intensities = new Float32Array(height);
  if (!frequencyData || frequencyData.length === 0) return intensities;

  const bins = frequencyData.length;
  const { mapping, buffer: logData } = getLogMapping(bins);
  applyLogFrequencyMapping(frequencyData, mapping, logData);

  const binsPerRow = bins / height;
  for (let row = 0; row < height; row++) {
    const startBin = Math.floor(row * binsPerRow);
    const endBin = Math.floor((row + 1) * binsPerRow);
    let maxDb = MIN_DB;
    for (let bin = startBin; bin < endBin; bin++) {
      if (logData[bin] > maxDb) maxDb = logData[bin];
    }
    // bin 0 → bottom row, normalize to 0–1
    intensities[height - row - 1] = dbToByte(maxDb) / 255;
  }
  return intensities;
}

// --- Pixel-level beam rendering via ImageData ---

/**
 * Additive-blend a single pixel into the ImageData buffer.
 * Clamps each channel to 255.
 */
function addPixel(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  // Pre-multiply alpha for additive blend
  const pr = r * a;
  const pg = g * a;
  const pb = b * a;
  data[idx] = Math.min(255, data[idx] + pr);
  data[idx + 1] = Math.min(255, data[idx + 1] + pg);
  data[idx + 2] = Math.min(255, data[idx + 2] + pb);
  data[idx + 3] = Math.min(255, data[idx + 3] + Math.round(a * 255));
}

function renderBeamToImageData(
  imageData: ImageData,
  intensities: Float32Array,
  loudness: number,
  flareIntensity: number,
  centerX: number,
): void {
  const { width, height, data } = imageData;
  const flareMult = 1 + flareIntensity;

  for (let y = 0; y < height; y++) {
    const freq = intensities[y];
    const combined = Math.min(1, loudness * 0.6 + freq * 0.4);

    // Compute layer radii for this row
    const auraR = OUTER_AURA_RADIUS * loudness * flareMult;
    const plasmaR = PLASMA_FIELD_RADIUS * combined * flareMult;
    const innerR = INNER_GLOW_RADIUS * combined * flareMult;
    const coreR = CORE_HALF_WIDTH * flareMult;

    const maxR = Math.ceil(Math.max(auraR, plasmaR, innerR, coreR));
    const xStart = Math.max(0, Math.floor(centerX - maxR));
    const xEnd = Math.min(width - 1, Math.ceil(centerX + maxR));
    const rowOffset = y * width * 4;

    for (let x = xStart; x <= xEnd; x++) {
      const dx = Math.abs(x - centerX);
      const idx = rowOffset + x * 4;

      // Outer aura — soft blue
      if (dx < auraR && auraR > 0) {
        const d = dx / auraR;
        const falloff = Math.exp(-d * d * 3);
        const a = 0.06 * loudness * falloff;
        addPixel(data, idx, 100, 150, 255, a);
      }

      // Plasma field — electric blue
      if (dx < plasmaR && plasmaR > 0) {
        const d = dx / plasmaR;
        const falloff = Math.exp(-d * d * 4);
        const a = 0.14 * combined * falloff;
        addPixel(data, idx, 140, 180, 255, a);
      }

      // Inner glow — warm incandescent
      if (dx < innerR && innerR > 0) {
        const d = dx / innerR;
        const falloff = Math.exp(-d * d * 3);
        const a = 0.35 * combined * falloff;
        addPixel(data, idx, 255, 210, 120, a);
      }

      // Core — white-hot
      if (dx < coreR) {
        const a = 0.4 + combined * 0.6;
        addPixel(data, idx, 255, 255, 255, Math.min(1, a));
      }
    }
  }
}

function renderEtchMarksToImageData(
  imageData: ImageData,
  state: PlasmaState,
  scrollLeft: number,
  playheadScreenX: number,
  now: number,
): void {
  const { width, height, data } = imageData;

  for (const mark of state.etchMarks) {
    const age = now - mark.timestamp;
    const fade = Math.max(0, 1 - age / ETCH_MAX_AGE_MS);
    const alpha = mark.intensity * fade * 0.4;
    if (alpha < 0.01) continue;

    const screenX = Math.round(playheadScreenX - (scrollLeft - mark.scrollPx));
    if (screenX < -1 || screenX > width + 1) continue;

    for (let dx = -1; dx <= 1; dx++) {
      const x = screenX + dx;
      if (x < 0 || x >= width) continue;
      const edgeFade = dx === 0 ? 1 : 0.4;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        addPixel(data, idx, 255, 200, 50, alpha * edgeFade);
      }
    }
  }
}

// --- Spark and tendril rendering (uses canvas API for lines) ---

function drawSparksLayer(
  ctx: CanvasRenderingContext2D,
  state: PlasmaState,
): void {
  if (state.sparks.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const spark of state.sparks) {
    const lifeFrac = spark.life / spark.maxLife;
    const alpha = lifeFrac * 0.9;
    const size = 1 + lifeFrac;

    ctx.fillStyle = `rgba(255,240,200,${alpha})`;
    ctx.fillRect(spark.x - size / 2, spark.y - size / 2, size, size);

    const trailAlpha = alpha * 0.5;
    ctx.strokeStyle = `rgba(255,200,100,${trailAlpha})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(
      spark.x - spark.vx * lifeFrac * 0.03,
      spark.y - spark.vy * lifeFrac * 0.03,
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawTendrils(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  height: number,
  flareIntensity: number,
): void {
  if (flareIntensity < 0.3) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const tendrilCount = 3 + Math.floor(flareIntensity * 4);
  for (let i = 0; i < tendrilCount; i++) {
    const y = Math.random() * height;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const length = (10 + Math.random() * 15) * flareIntensity;
    const alpha = flareIntensity * 0.2 * Math.random();

    const endX = centerX + direction * length;
    const left = Math.min(centerX, endX);

    const gradient = ctx.createLinearGradient(centerX, y, endX, y);
    gradient.addColorStop(0, `rgba(180,200,255,${alpha})`);
    gradient.addColorStop(1, 'rgba(80,120,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, y - 0.5, Math.abs(length), 1);
  }

  ctx.restore();
}

// --- Main entry point ---

export function renderPlasmaFrame(
  ctx: CanvasRenderingContext2D,
  state: PlasmaState,
  frequencyData: Float32Array | null,
  loudness: number,
  height: number,
  canvasWidth: number,
  scrollLeft: number,
  playheadScreenX: number,
  now: number,
  deltaTime: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, height);

  // State updates
  const isBeat = updateBeatDetection(state, loudness, deltaTime);
  if (isBeat) {
    spawnSparks(state, playheadScreenX, height, loudness);
    stampEtchMark(state, scrollLeft, loudness, now);
  }
  updateSparks(state, deltaTime);
  pruneEtchMarks(state, now);

  // Build per-row frequency intensities
  const intensities = getFrequencyIntensities(frequencyData, height);

  // Render beam + etch marks into ImageData (single putImageData call)
  const imageData = ctx.createImageData(canvasWidth, height);
  renderEtchMarksToImageData(
    imageData,
    state,
    scrollLeft,
    playheadScreenX,
    now,
  );
  renderBeamToImageData(
    imageData,
    intensities,
    loudness,
    state.flareIntensity,
    playheadScreenX,
  );
  ctx.putImageData(imageData, 0, 0);

  // Overlay sparks and tendrils (small number of draw calls)
  drawTendrils(ctx, playheadScreenX, height, state.flareIntensity);
  drawSparksLayer(ctx, state);
}

// --- Idle state (not playing) ---

export function renderIdleFrame(
  ctx: CanvasRenderingContext2D,
  height: number,
  canvasWidth: number,
  centerX: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.fillRect(centerX - 0.5, 0, 1, height);
}
