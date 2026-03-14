// --- Beat detection ---

const EMA_DECAY = 0.05;
const BEAT_THRESHOLD = 1.6;
const BEAT_LOUDNESS_FLOOR = 0.15;
const FLARE_DECAY_RATE = 5;

// --- Beam layer radii (enhanced for vibrant plasma look) ---

const CORE_HALF_WIDTH = 2.0;
const INNER_GLOW_RADIUS = 12;
const PLASMA_FIELD_RADIUS = 28;
const OUTER_AURA_RADIUS = 60;

// --- Beam pulsation ---

const PULSE_SLOW_SPEED = 0.004;
const PULSE_FAST_SPEED = 0.011;

// --- Spark particles ---

const SPARK_COUNT_MIN = 8;
const SPARK_COUNT_MAX = 25;
const SPARK_SPEED_MIN = 50;
const SPARK_SPEED_MAX = 180;
const SPARK_MAX_LIFE = 0.3;

// --- Types ---

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
  prevLoudness: number;
};

export function createPlasmaState(): PlasmaState {
  return {
    loudnessEMA: 0,
    flareIntensity: 0,
    sparks: [],
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
  centerY: number,
  width: number,
  intensity: number,
): void {
  const count =
    SPARK_COUNT_MIN +
    Math.floor(intensity * (SPARK_COUNT_MAX - SPARK_COUNT_MIN));
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const angle = (Math.random() - 0.5) * Math.PI;
    const speed =
      SPARK_SPEED_MIN + Math.random() * (SPARK_SPEED_MAX - SPARK_SPEED_MIN);
    const life = SPARK_MAX_LIFE * (0.5 + Math.random() * 0.5);
    state.sparks.push({
      x,
      y: centerY,
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

// --- Rendering helpers ---

/**
 * Convert CQT visualization data (Uint8Array 0–255) into per-column
 * intensity values (0–1) for the canvas width. Low-frequency bins map
 * to left columns, high-frequency bins to right columns.
 *
 * CQT bins are already log-spaced (24 bins/octave from 32.7 Hz to
 * Nyquist), matching the offline spectrogram exactly.
 */
export function getFrequencyIntensities(
  visualizationData: Uint8Array | null,
  width: number,
): Float32Array {
  const intensities = new Float32Array(width);
  if (!visualizationData || visualizationData.length === 0) return intensities;

  const bins = visualizationData.length;
  const binsPerCol = bins / width;
  for (let col = 0; col < width; col++) {
    const startBin = Math.floor(col * binsPerCol);
    const endBin = Math.floor((col + 1) * binsPerCol);
    let maxByte = 0;
    for (let bin = startBin; bin < endBin; bin++) {
      if (visualizationData[bin] > maxByte) maxByte = visualizationData[bin];
    }
    // bin 0 → left column (low frequency), normalize to 0–1
    intensities[col] = maxByte / 255;
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
  const pr = r * a;
  const pg = g * a;
  const pb = b * a;
  data[idx] = Math.min(255, data[idx] + pr);
  data[idx + 1] = Math.min(255, data[idx + 1] + pg);
  data[idx + 2] = Math.min(255, data[idx + 2] + pb);
  data[idx + 3] = Math.min(255, data[idx + 3] + Math.round(a * 255));
}

/**
 * Render a horizontal beam — frequency maps left-to-right (X axis),
 * the beam is centered at centerY and radiates up/down.
 */
function renderBeamToImageData(
  imageData: ImageData,
  intensities: Float32Array,
  loudness: number,
  flareIntensity: number,
  centerY: number,
  pulseMultiplier: number,
  colorPhase: number,
): void {
  const { width, height, data } = imageData;
  const flareMult = 1 + flareIntensity * 1.5;
  const pm = pulseMultiplier;

  const cyanShift = 0.5 + 0.5 * Math.sin(colorPhase);
  const purpleShift = 0.5 + 0.5 * Math.sin(colorPhase + 2.1);

  for (let x = 0; x < width; x++) {
    const freq = intensities[x] ?? 0;
    const combined = Math.min(1, loudness * 0.5 + freq * 0.5);

    const auraR = OUTER_AURA_RADIUS * loudness * flareMult * pm;
    const plasmaR = PLASMA_FIELD_RADIUS * combined * flareMult * pm;
    const innerR = INNER_GLOW_RADIUS * combined * flareMult * pm;
    const coreR = CORE_HALF_WIDTH * flareMult * pm;

    const maxR = Math.ceil(Math.max(auraR, plasmaR, innerR, coreR));
    const yStart = Math.max(0, Math.floor(centerY - maxR));
    const yEnd = Math.min(height - 1, Math.ceil(centerY + maxR));

    for (let y = yStart; y <= yEnd; y++) {
      const dy = Math.abs(y - centerY);
      const idx = (y * width + x) * 4;

      if (dy < auraR && auraR > 0) {
        const d = dy / auraR;
        const falloff = Math.exp(-d * d * 2.5);
        const a = 0.12 * loudness * falloff;
        const r = 40 + 60 * purpleShift;
        const g = 60 + 40 * cyanShift;
        const b = 200 + 55 * cyanShift;
        addPixel(data, idx, r, g, b, a);
      }

      if (dy < plasmaR && plasmaR > 0) {
        const d = dy / plasmaR;
        const falloff = Math.exp(-d * d * 3.5);
        const a = 0.22 * combined * falloff;
        const r = 80 + 80 * purpleShift;
        const g = 140 + 60 * cyanShift;
        addPixel(data, idx, r, g, 255, a);
      }

      if (dy < innerR && innerR > 0) {
        const d = dy / innerR;
        const falloff = Math.exp(-d * d * 3);
        const a = 0.5 * combined * falloff;
        const r = 140 + 115 * freq;
        const g = 230 + 25 * freq;
        addPixel(data, idx, r, g, 255, a);
      }

      if (dy < coreR) {
        const a = 0.5 + combined * 0.5;
        addPixel(data, idx, 255, 255, 255, Math.min(1, a));
      }
    }
  }
}

// --- Canvas API rendering layers ---

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
    const size = 1.5 + lifeFrac * 1.5;

    ctx.fillStyle = `rgba(200,240,255,${alpha})`;
    ctx.fillRect(spark.x - size / 2, spark.y - size / 2, size, size);

    const trailAlpha = alpha * 0.5;
    ctx.strokeStyle = `rgba(100,180,255,${trailAlpha})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(spark.x, spark.y);
    ctx.lineTo(
      spark.x - spark.vx * lifeFrac * 0.04,
      spark.y - spark.vy * lifeFrac * 0.04,
    );
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Tendrils radiate up and down from the beam center.
 */
function drawTendrils(
  ctx: CanvasRenderingContext2D,
  centerY: number,
  width: number,
  flareIntensity: number,
  loudness: number,
): void {
  const tendrilBase = Math.max(0, flareIntensity, loudness * 0.3);
  if (tendrilBase < 0.15) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const tendrilCount = 4 + Math.floor(tendrilBase * 6);
  for (let i = 0; i < tendrilCount; i++) {
    const x = Math.random() * width;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const length = (12 + Math.random() * 25) * tendrilBase;
    const alpha = tendrilBase * 0.25 * Math.random();

    const endY = centerY + direction * length;
    const top = Math.min(centerY, endY);

    const gradient = ctx.createLinearGradient(x, centerY, x, endY);
    gradient.addColorStop(0, `rgba(150,220,255,${alpha})`);
    gradient.addColorStop(0.5, `rgba(100,150,255,${alpha * 0.4})`);
    gradient.addColorStop(1, 'rgba(60,100,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 0.5, top, 1, Math.abs(length));
  }

  ctx.restore();
}

// --- Main entry point ---

export function renderPlasmaFrame(
  ctx: CanvasRenderingContext2D,
  state: PlasmaState,
  frequencyData: Uint8Array | null,
  loudness: number,
  canvasWidth: number,
  canvasHeight: number,
  playheadScreenY: number,
  now: number,
  deltaTime: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const isBeat = updateBeatDetection(state, loudness, deltaTime);
  if (isBeat) {
    spawnSparks(state, playheadScreenY, canvasWidth, loudness);
  }
  updateSparks(state, deltaTime);

  const intensities = getFrequencyIntensities(frequencyData, canvasWidth);

  const pulseMultiplier =
    (0.85 + 0.15 * Math.sin(now * PULSE_SLOW_SPEED)) *
    (0.93 + 0.07 * Math.sin(now * PULSE_FAST_SPEED));
  const colorPhase = now * 0.002;

  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  renderBeamToImageData(
    imageData,
    intensities,
    loudness,
    state.flareIntensity,
    playheadScreenY,
    pulseMultiplier,
    colorPhase,
  );
  ctx.putImageData(imageData, 0, 0);

  drawTendrils(
    ctx,
    playheadScreenY,
    canvasWidth,
    state.flareIntensity,
    loudness,
  );
  drawSparksLayer(ctx, state);
}

// --- Idle state (not playing) ---

export function renderIdleFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  centerY: number,
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // Subtle outer glow
  const glowHeight = 20;
  const gradient = ctx.createLinearGradient(
    0,
    centerY - glowHeight,
    0,
    centerY + glowHeight,
  );
  gradient.addColorStop(0, 'rgba(60, 140, 255, 0)');
  gradient.addColorStop(0.3, 'rgba(60, 140, 255, 0.02)');
  gradient.addColorStop(0.5, 'rgba(120, 200, 255, 0.06)');
  gradient.addColorStop(0.7, 'rgba(60, 140, 255, 0.02)');
  gradient.addColorStop(1, 'rgba(60, 140, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, centerY - glowHeight, canvasWidth, glowHeight * 2);

  // Core line with slight cyan tint — horizontal line
  ctx.fillStyle = 'rgba(180, 220, 255, 0.65)';
  ctx.fillRect(0, centerY - 0.5, canvasWidth, 1);
}
