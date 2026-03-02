// --- Beat detection ---

const EMA_DECAY = 0.05;
const BEAT_THRESHOLD = 1.6;
const BEAT_LOUDNESS_FLOOR = 0.15;
const FLARE_DECAY_RATE = 5;

// --- Etch marks ---

const ETCH_MAX_AGE_MS = 12_000;

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

// --- Mist particles ---

const MIST_SPAWN_ATTEMPTS = 4;
const MIST_SPAWN_PROBABILITY = 0.45;
const MIST_MAX_PARTICLES = 150;
const MIST_DRIFT_SPEED_MIN = 15;
const MIST_DRIFT_SPEED_MAX = 55;
const MIST_LIFE_MIN = 0.8;
const MIST_LIFE_MAX = 2.5;
const MIST_SIZE_MIN = 5;
const MIST_SIZE_MAX = 18;
const MIST_VERTICAL_WANDER = 8;
const MIST_DECELERATION = 0.5;

// Default mist color when no track is dominant (cyan-blue)
const MIST_DEFAULT_COLOR: [number, number, number] = [100, 200, 255];

// --- Types ---

export type TrackFrequencyInput = {
  r: number;
  g: number;
  b: number;
  data: Uint8Array;
};

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

export type MistParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
};

export type PlasmaState = {
  loudnessEMA: number;
  flareIntensity: number;
  sparks: Spark[];
  etchMarks: EtchMark[];
  mistParticles: MistParticle[];
  prevLoudness: number;
};

export function createPlasmaState(): PlasmaState {
  return {
    loudnessEMA: 0,
    flareIntensity: 0,
    sparks: [],
    etchMarks: [],
    mistParticles: [],
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

// --- Mist management ---

type TrackMistInput = {
  r: number;
  g: number;
  b: number;
  intensities: Float32Array;
};

function getDominantTrackColor(
  trackInputs: TrackMistInput[],
  rowIndex: number,
): [number, number, number] {
  let maxIntensity = 0;
  let r = MIST_DEFAULT_COLOR[0];
  let g = MIST_DEFAULT_COLOR[1];
  let b = MIST_DEFAULT_COLOR[2];

  for (const track of trackInputs) {
    const intensity = track.intensities[rowIndex] || 0;
    if (intensity > maxIntensity) {
      maxIntensity = intensity;
      r = track.r;
      g = track.g;
      b = track.b;
    }
  }

  return [r, g, b];
}

export function spawnMistParticles(
  state: PlasmaState,
  centerX: number,
  height: number,
  intensities: Float32Array,
  trackMistInputs: TrackMistInput[],
  loudness: number,
): void {
  if (state.mistParticles.length >= MIST_MAX_PARTICLES) return;
  if (loudness < 0.02) return;

  for (let i = 0; i < MIST_SPAWN_ATTEMPTS; i++) {
    if (state.mistParticles.length >= MIST_MAX_PARTICLES) break;

    const y = Math.random() * height;
    const rowIndex = Math.min(height - 1, Math.floor(y));
    const intensity = intensities[rowIndex] || 0;

    if (Math.random() > intensity * loudness * MIST_SPAWN_PROBABILITY) continue;

    // Drift right-to-left, following the timeline scroll direction
    const speed =
      MIST_DRIFT_SPEED_MIN +
      Math.random() * (MIST_DRIFT_SPEED_MAX - MIST_DRIFT_SPEED_MIN);
    const life =
      MIST_LIFE_MIN + Math.random() * (MIST_LIFE_MAX - MIST_LIFE_MIN);
    const size = MIST_SIZE_MIN + intensity * (MIST_SIZE_MAX - MIST_SIZE_MIN);
    const [r, g, b] = getDominantTrackColor(trackMistInputs, rowIndex);

    state.mistParticles.push({
      x: centerX + (Math.random() - 0.5) * 4,
      y,
      vx: -speed * (0.7 + intensity * 0.3),
      vy: (Math.random() - 0.5) * MIST_VERTICAL_WANDER,
      life,
      maxLife: life,
      size,
      r: Math.round(r),
      g: Math.round(g),
      b: Math.round(b),
    });
  }
}

export function updateMistParticles(
  state: PlasmaState,
  deltaTime: number,
): void {
  for (let i = state.mistParticles.length - 1; i >= 0; i--) {
    const p = state.mistParticles[i];
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= deltaTime;
    // Smoke deceleration — particles slow as they drift away
    p.vx *= 1 - MIST_DECELERATION * deltaTime;
    if (p.life <= 0) {
      state.mistParticles.splice(i, 1);
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

/**
 * Convert visualization data (pre-mapped Uint8Array 0–255) into per-row
 * intensity values (0–1) for the canvas height. Low-frequency bins map
 * to bottom rows, high-frequency bins to top rows.
 */
export function getFrequencyIntensities(
  visualizationData: Uint8Array | null,
  height: number,
): Float32Array {
  const intensities = new Float32Array(height);
  if (!visualizationData || visualizationData.length === 0) return intensities;

  const bins = visualizationData.length;
  const binsPerRow = bins / height;
  for (let row = 0; row < height; row++) {
    const startBin = Math.floor(row * binsPerRow);
    const endBin = Math.floor((row + 1) * binsPerRow);
    let maxByte = 0;
    for (let bin = startBin; bin < endBin; bin++) {
      if (visualizationData[bin] > maxByte) maxByte = visualizationData[bin];
    }
    // bin 0 → bottom row, normalize to 0–1
    intensities[height - row - 1] = maxByte / 255;
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
  pulseMultiplier: number,
  colorPhase: number,
): void {
  const { width, height, data } = imageData;
  const flareMult = 1 + flareIntensity * 1.5;
  const pm = pulseMultiplier;

  // Color phase shifts for vibrant plasma cycling
  const cyanShift = 0.5 + 0.5 * Math.sin(colorPhase);
  const purpleShift = 0.5 + 0.5 * Math.sin(colorPhase + 2.1);

  for (let y = 0; y < height; y++) {
    const freq = intensities[y];
    const combined = Math.min(1, loudness * 0.5 + freq * 0.5);

    // Pulsating radii — each layer breathes with the music
    const auraR = OUTER_AURA_RADIUS * loudness * flareMult * pm;
    const plasmaR = PLASMA_FIELD_RADIUS * combined * flareMult * pm;
    const innerR = INNER_GLOW_RADIUS * combined * flareMult * pm;
    const coreR = CORE_HALF_WIDTH * flareMult * pm;

    const maxR = Math.ceil(Math.max(auraR, plasmaR, innerR, coreR));
    const xStart = Math.max(0, Math.floor(centerX - maxR));
    const xEnd = Math.min(width - 1, Math.ceil(centerX + maxR));
    const rowOffset = y * width * 4;

    for (let x = xStart; x <= xEnd; x++) {
      const dx = Math.abs(x - centerX);
      const idx = rowOffset + x * 4;

      // Outer aura — deep blue-purple atmosphere
      if (dx < auraR && auraR > 0) {
        const d = dx / auraR;
        const falloff = Math.exp(-d * d * 2.5);
        const a = 0.12 * loudness * falloff;
        const r = 40 + 60 * purpleShift;
        const g = 60 + 40 * cyanShift;
        const b = 200 + 55 * cyanShift;
        addPixel(data, idx, r, g, b, a);
      }

      // Plasma field — electric blue with purple shimmer
      if (dx < plasmaR && plasmaR > 0) {
        const d = dx / plasmaR;
        const falloff = Math.exp(-d * d * 3.5);
        const a = 0.22 * combined * falloff;
        const r = 80 + 80 * purpleShift;
        const g = 140 + 60 * cyanShift;
        addPixel(data, idx, r, g, 255, a);
      }

      // Inner glow — hot cyan-white
      if (dx < innerR && innerR > 0) {
        const d = dx / innerR;
        const falloff = Math.exp(-d * d * 3);
        const a = 0.5 * combined * falloff;
        const r = 140 + 115 * freq;
        const g = 230 + 25 * freq;
        addPixel(data, idx, r, g, 255, a);
      }

      // Core — white-hot
      if (dx < coreR) {
        const a = 0.5 + combined * 0.5;
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
    const alpha = mark.intensity * fade * 0.35;
    if (alpha < 0.01) continue;

    const screenX = Math.round(playheadScreenX - (scrollLeft - mark.scrollPx));
    if (screenX < -1 || screenX > width + 1) continue;

    for (let dx = -1; dx <= 1; dx++) {
      const x = screenX + dx;
      if (x < 0 || x >= width) continue;
      const edgeFade = dx === 0 ? 1 : 0.4;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        // Cyan-blue etch marks to match plasma theme
        addPixel(data, idx, 100, 200, 255, alpha * edgeFade);
      }
    }
  }
}

// --- Canvas API rendering layers ---

function drawMistLayer(
  ctx: CanvasRenderingContext2D,
  state: PlasmaState,
): void {
  if (state.mistParticles.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const p of state.mistParticles) {
    const lifeFrac = p.life / p.maxLife;
    // Fade in quickly, fade out slowly
    const fadeIn = Math.min(1, (1 - lifeFrac) * 5);
    const fadeOut = lifeFrac;
    const alpha = fadeIn * fadeOut * 0.3;
    if (alpha < 0.005) continue;

    // Grow slightly as particle ages (smoke expansion)
    const size = p.size * (0.6 + 0.4 * (1 - lifeFrac));

    // Horizontally elongated soft blob for wispy smoke look
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1.8, 1.0);

    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${alpha})`);
    grad.addColorStop(0.3, `rgba(${p.r},${p.g},${p.b},${alpha * 0.6})`);
    grad.addColorStop(0.7, `rgba(${p.r},${p.g},${p.b},${alpha * 0.15})`);
    grad.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-size, -size, size * 2, size * 2);

    ctx.restore();
  }

  ctx.restore();
}

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

    // Bright cyan-white sparks
    ctx.fillStyle = `rgba(200,240,255,${alpha})`;
    ctx.fillRect(spark.x - size / 2, spark.y - size / 2, size, size);

    // Trail with blue tint
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

function drawTendrils(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  height: number,
  flareIntensity: number,
  loudness: number,
): void {
  // Show tendrils on beats and when loudness is substantial
  const tendrilBase = Math.max(0, flareIntensity, loudness * 0.3);
  if (tendrilBase < 0.15) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const tendrilCount = 4 + Math.floor(tendrilBase * 6);
  for (let i = 0; i < tendrilCount; i++) {
    const y = Math.random() * height;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const length = (12 + Math.random() * 25) * tendrilBase;
    const alpha = tendrilBase * 0.25 * Math.random();

    const endX = centerX + direction * length;
    const left = Math.min(centerX, endX);

    const gradient = ctx.createLinearGradient(centerX, y, endX, y);
    gradient.addColorStop(0, `rgba(150,220,255,${alpha})`);
    gradient.addColorStop(0.5, `rgba(100,150,255,${alpha * 0.4})`);
    gradient.addColorStop(1, 'rgba(60,100,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, y - 0.5, Math.abs(length), 1);
  }

  ctx.restore();
}

// --- Main entry point ---

export function renderPlasmaFrame(
  ctx: CanvasRenderingContext2D,
  state: PlasmaState,
  frequencyData: Uint8Array | null,
  loudness: number,
  height: number,
  canvasWidth: number,
  scrollLeft: number,
  playheadScreenX: number,
  now: number,
  deltaTime: number,
  trackFrequencyInputs: TrackFrequencyInput[],
): void {
  ctx.clearRect(0, 0, canvasWidth, height);

  // State updates — beat detection and glow react to the master loudness only
  const isBeat = updateBeatDetection(state, loudness, deltaTime);
  if (isBeat) {
    spawnSparks(state, playheadScreenX, height, loudness);
    stampEtchMark(state, scrollLeft, loudness, now);
  }
  updateSparks(state, deltaTime);
  pruneEtchMarks(state, now);

  // Build per-row frequency intensities from combined master data (for beam)
  const intensities = getFrequencyIntensities(frequencyData, height);

  // Build per-track intensities for mist coloring
  const trackMistInputs: TrackMistInput[] = trackFrequencyInputs.map(
    (input) => ({
      r: input.r,
      g: input.g,
      b: input.b,
      intensities: getFrequencyIntensities(input.data, height),
    }),
  );

  // Spawn and update mist particles — colored by dominant track per frequency band
  spawnMistParticles(
    state,
    playheadScreenX,
    height,
    intensities,
    trackMistInputs,
    loudness,
  );
  updateMistParticles(state, deltaTime);

  // Pulsation — beam breathes with slow and fast rhythms
  const pulseMultiplier =
    (0.85 + 0.15 * Math.sin(now * PULSE_SLOW_SPEED)) *
    (0.93 + 0.07 * Math.sin(now * PULSE_FAST_SPEED));
  const colorPhase = now * 0.002;

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
    pulseMultiplier,
    colorPhase,
  );
  ctx.putImageData(imageData, 0, 0);

  // Overlay mist, tendrils, and sparks (canvas API for soft rendering)
  drawMistLayer(ctx, state);
  drawTendrils(ctx, playheadScreenX, height, state.flareIntensity, loudness);
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

  // Subtle outer glow
  const glowWidth = 20;
  const gradient = ctx.createLinearGradient(
    centerX - glowWidth,
    0,
    centerX + glowWidth,
    0,
  );
  gradient.addColorStop(0, 'rgba(60, 140, 255, 0)');
  gradient.addColorStop(0.3, 'rgba(60, 140, 255, 0.02)');
  gradient.addColorStop(0.5, 'rgba(120, 200, 255, 0.06)');
  gradient.addColorStop(0.7, 'rgba(60, 140, 255, 0.02)');
  gradient.addColorStop(1, 'rgba(60, 140, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(centerX - glowWidth, 0, glowWidth * 2, height);

  // Core line with slight cyan tint
  ctx.fillStyle = 'rgba(180, 220, 255, 0.65)';
  ctx.fillRect(centerX - 0.5, 0, 1, height);
}
