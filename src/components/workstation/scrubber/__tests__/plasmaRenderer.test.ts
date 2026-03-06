import {
  CQT_ALIGNMENT_OFFSET,
  createPlasmaState,
  getFrequencyIntensities,
  pruneEtchMarks,
  spawnMistParticles,
  spawnSparks,
  stampEtchMark,
  updateBeatDetection,
  updateMistParticles,
  updateSparks,
} from '../plasmaRenderer';

describe('createPlasmaState', () => {
  it('returns initial state with zeroed values and empty arrays', () => {
    const state = createPlasmaState();

    expect(state.loudnessEMA).toBe(0);
    expect(state.flareIntensity).toBe(0);
    expect(state.prevLoudness).toBe(0);
    expect(state.sparks).toEqual([]);
    expect(state.etchMarks).toEqual([]);
    expect(state.mistParticles).toEqual([]);
  });
});

describe('updateBeatDetection', () => {
  it('detects beat when loudness spikes above EMA threshold', () => {
    const state = createPlasmaState();
    // Warm up EMA to a low baseline
    state.loudnessEMA = 0.2;

    const isBeat = updateBeatDetection(state, 0.8, 0.016);

    expect(isBeat).toBe(true);
    // Flare is set to 1.0 then decayed by FLARE_DECAY_RATE * deltaTime
    expect(state.flareIntensity).toBeGreaterThan(0.8);
  });

  it('does not detect beat on gradual loudness rise', () => {
    const state = createPlasmaState();
    state.loudnessEMA = 0.5;

    const isBeat = updateBeatDetection(state, 0.55, 0.016);

    expect(isBeat).toBe(false);
  });

  it('does not detect beat when loudness is below floor', () => {
    const state = createPlasmaState();
    state.loudnessEMA = 0.05;

    // High ratio but low absolute loudness
    const isBeat = updateBeatDetection(state, 0.1, 0.016);

    expect(isBeat).toBe(false);
  });

  it('decays flare intensity over time', () => {
    const state = createPlasmaState();
    state.flareIntensity = 1.0;

    updateBeatDetection(state, 0.3, 0.1);

    expect(state.flareIntensity).toBeLessThan(1.0);
    expect(state.flareIntensity).toBeGreaterThan(0);
  });

  it('clamps flare intensity to zero', () => {
    const state = createPlasmaState();
    state.flareIntensity = 0.01;

    updateBeatDetection(state, 0.3, 1.0);

    expect(state.flareIntensity).toBe(0);
  });

  it('updates prevLoudness', () => {
    const state = createPlasmaState();

    updateBeatDetection(state, 0.42, 0.016);

    expect(state.prevLoudness).toBe(0.42);
  });
});

describe('spawnSparks', () => {
  it('creates particles with valid positions near the center', () => {
    const state = createPlasmaState();

    spawnSparks(state, 60, 200, 0.5);

    expect(state.sparks.length).toBeGreaterThanOrEqual(8);
    expect(state.sparks.length).toBeLessThanOrEqual(25);
    for (const spark of state.sparks) {
      expect(spark.x).toBe(60);
      expect(spark.y).toBeGreaterThanOrEqual(0);
      expect(spark.y).toBeLessThanOrEqual(200);
      expect(spark.life).toBeGreaterThan(0);
      expect(spark.maxLife).toBe(spark.life);
    }
  });

  it('creates more sparks at higher intensity', () => {
    const stateLow = createPlasmaState();
    const stateHigh = createPlasmaState();

    spawnSparks(stateLow, 60, 200, 0);
    spawnSparks(stateHigh, 60, 200, 1);

    expect(stateHigh.sparks.length).toBeGreaterThanOrEqual(
      stateLow.sparks.length,
    );
  });
});

describe('updateSparks', () => {
  it('advances spark positions by velocity', () => {
    const state = createPlasmaState();
    state.sparks.push({
      x: 10,
      y: 20,
      vx: 100,
      vy: -50,
      life: 0.1,
      maxLife: 0.15,
    });

    updateSparks(state, 0.016);

    expect(state.sparks[0].x).toBeCloseTo(10 + 100 * 0.016);
    expect(state.sparks[0].y).toBeCloseTo(20 + -50 * 0.016);
  });

  it('removes expired sparks', () => {
    const state = createPlasmaState();
    state.sparks.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0.01,
      maxLife: 0.1,
    });

    updateSparks(state, 0.05);

    expect(state.sparks).toHaveLength(0);
  });

  it('keeps alive sparks', () => {
    const state = createPlasmaState();
    state.sparks.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0.5,
      maxLife: 0.5,
    });

    updateSparks(state, 0.016);

    expect(state.sparks).toHaveLength(1);
    expect(state.sparks[0].life).toBeCloseTo(0.5 - 0.016);
  });
});

describe('spawnMistParticles', () => {
  it('does not spawn when loudness is below threshold', () => {
    const state = createPlasmaState();
    const intensities = new Float32Array(10).fill(1.0);

    spawnMistParticles(state, 120, 10, intensities, [], 0.01);

    expect(state.mistParticles).toHaveLength(0);
  });

  it('does not spawn when particle limit is reached', () => {
    const state = createPlasmaState();
    // Fill up to the max
    for (let i = 0; i < 150; i++) {
      state.mistParticles.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 1,
        maxLife: 1,
        size: 5,
        r: 0,
        g: 0,
        b: 0,
      });
    }
    const intensities = new Float32Array(10).fill(1.0);

    spawnMistParticles(state, 120, 10, intensities, [], 1.0);

    expect(state.mistParticles).toHaveLength(150);
  });

  it('spawns particles with valid properties at high loudness and intensity', () => {
    const state = createPlasmaState();
    const intensities = new Float32Array(100).fill(1.0);

    // Use deterministic random to guarantee spawns
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    spawnMistParticles(state, 120, 100, intensities, [], 1.0);
    randomSpy.mockRestore();

    // At max loudness and intensity, all spawn attempts should succeed
    expect(state.mistParticles.length).toBeGreaterThan(0);
    for (const p of state.mistParticles) {
      expect(p.life).toBeGreaterThan(0);
      expect(p.maxLife).toBe(p.life);
      expect(p.size).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('updateMistParticles', () => {
  it('advances positions and decelerates', () => {
    const state = createPlasmaState();
    state.mistParticles.push({
      x: 100,
      y: 50,
      vx: 40,
      vy: 2,
      life: 2.0,
      maxLife: 2.0,
      size: 10,
      r: 100,
      g: 200,
      b: 255,
    });

    updateMistParticles(state, 0.016);

    expect(state.mistParticles).toHaveLength(1);
    expect(state.mistParticles[0].x).toBeGreaterThan(100);
    expect(state.mistParticles[0].life).toBeCloseTo(2.0 - 0.016);
    // Velocity should have decreased due to deceleration
    expect(state.mistParticles[0].vx).toBeLessThan(40);
  });

  it('removes expired particles', () => {
    const state = createPlasmaState();
    state.mistParticles.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0.01,
      maxLife: 1,
      size: 5,
      r: 0,
      g: 0,
      b: 0,
    });

    updateMistParticles(state, 0.05);

    expect(state.mistParticles).toHaveLength(0);
  });
});

describe('stampEtchMark', () => {
  it('records etch mark at the given scroll position', () => {
    const state = createPlasmaState();

    stampEtchMark(state, 500, 0.8, 1000);

    expect(state.etchMarks).toHaveLength(1);
    expect(state.etchMarks[0].scrollPx).toBe(500);
    expect(state.etchMarks[0].timestamp).toBe(1000);
    expect(state.etchMarks[0].intensity).toBeGreaterThan(0);
  });

  it('clamps intensity to 1.0', () => {
    const state = createPlasmaState();

    stampEtchMark(state, 0, 1.0, 0);

    expect(state.etchMarks[0].intensity).toBeLessThanOrEqual(1.0);
  });
});

describe('pruneEtchMarks', () => {
  it('removes marks older than 12 seconds', () => {
    const state = createPlasmaState();
    state.etchMarks.push({ scrollPx: 0, intensity: 1, timestamp: 0 });
    state.etchMarks.push({ scrollPx: 100, intensity: 1, timestamp: 5000 });

    pruneEtchMarks(state, 13_000);

    expect(state.etchMarks).toHaveLength(1);
    expect(state.etchMarks[0].scrollPx).toBe(100);
  });

  it('keeps recent marks', () => {
    const state = createPlasmaState();
    state.etchMarks.push({ scrollPx: 0, intensity: 1, timestamp: 10_000 });

    pruneEtchMarks(state, 11_000);

    expect(state.etchMarks).toHaveLength(1);
  });

  it('handles empty array', () => {
    const state = createPlasmaState();

    pruneEtchMarks(state, 100_000);

    expect(state.etchMarks).toHaveLength(0);
  });
});

describe('getFrequencyIntensities', () => {
  it('returns zero-filled array when visualization data is null', () => {
    const result = getFrequencyIntensities(null, 10);

    expect(result).toHaveLength(10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('returns zero-filled array when visualization data is empty', () => {
    const result = getFrequencyIntensities(new Uint8Array(0), 10);

    expect(result).toHaveLength(10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('maps max byte value to high intensity', () => {
    // All bins at max (255)
    const data = new Uint8Array(8).fill(255);

    const result = getFrequencyIntensities(data, 4);

    expect(result).toHaveLength(4);
    for (const val of result) {
      expect(val).toBeCloseTo(1.0, 1);
    }
  });

  it('maps zero byte value to zero intensity', () => {
    const data = new Uint8Array(8).fill(0);

    const result = getFrequencyIntensities(data, 4);

    expect(result).toHaveLength(4);
    for (const val of result) {
      expect(val).toBeCloseTo(0, 1);
    }
  });

  it('skips low-frequency bins below CQT minimum frequency', () => {
    // Create data with a spike only in the low-frequency bins (below CQT range)
    const bins = 512;
    const data = new Uint8Array(bins).fill(0);
    const cqtStartBin = Math.floor(CQT_ALIGNMENT_OFFSET * bins);
    // Fill bins below CQT range with max intensity
    for (let i = 0; i < cqtStartBin; i++) {
      data[i] = 255;
    }

    const result = getFrequencyIntensities(data, 100);

    // All canvas rows should be zero because the energy is below CQT range
    for (const val of result) {
      expect(val).toBeCloseTo(0, 1);
    }
  });

  it('maps CQT-range bins to the full canvas height', () => {
    // Create data where only the upper portion (CQT range) has energy
    const bins = 512;
    const data = new Uint8Array(bins).fill(0);
    const cqtStartBin = Math.ceil(CQT_ALIGNMENT_OFFSET * bins);
    // Fill the CQT range with max intensity
    for (let i = cqtStartBin; i < bins; i++) {
      data[i] = 255;
    }

    const result = getFrequencyIntensities(data, 100);

    // All canvas rows should be at max intensity — CQT range fills the full height
    for (const val of result) {
      expect(val).toBeCloseTo(1.0, 1);
    }
  });
});

describe('CQT_ALIGNMENT_OFFSET', () => {
  it('represents the fraction of viz bins below CQT min frequency', () => {
    // CQT min frequency is 32.7 Hz, viz min is 2.5 Hz
    // The offset should be > 0 (some bins are below CQT range)
    expect(CQT_ALIGNMENT_OFFSET).toBeGreaterThan(0);
    // And < 1 (most bins are in CQT range)
    expect(CQT_ALIGNMENT_OFFSET).toBeLessThan(0.5);
  });

  it('is approximately 0.28 for standard sample rates', () => {
    // log(32.7/2.5) / log(22050/2.5) ≈ 0.283
    expect(CQT_ALIGNMENT_OFFSET).toBeCloseTo(0.28, 1);
  });
});
