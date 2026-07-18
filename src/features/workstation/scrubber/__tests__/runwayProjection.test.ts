import { describe, expect, it } from 'vitest';

import {
  planeToScreenY,
  type RunwayConfig,
  screenYToPlane,
  solveGeometry,
  widthAtPlane,
} from '../runwayProjection';

// Mirrors the pinned default preset from mawimbi#446.
const noteHighway: RunwayConfig = {
  tiltDeg: 70,
  playheadFraction: 0.75,
  playheadWidth: 0.65,
  elevationFraction: 0.55,
  runwayLengthPx: 1800,
  overhangPx: 320,
};

// A shallower, subtler tilt for contrast — matches the #402-era "ramp" feel.
const subtleRamp: RunwayConfig = {
  tiltDeg: 30,
  playheadFraction: 0.6,
  playheadWidth: 0.9,
  elevationFraction: 0.2,
  runwayLengthPx: 1200,
  overhangPx: 150,
};

describe('solveGeometry', () => {
  it('solves noteHighway golden values at a 650px visible height', () => {
    const geometry = solveGeometry(noteHighway, { width: 1000, height: 650 });

    expect(geometry.perspectivePx).toBeCloseTo(1511.113, 2);
    expect(geometry.transformOriginY).toBeCloseTo(680, 3);
    expect(geometry.perspectiveOriginY).toBeCloseTo(680, 3);
    expect(geometry.rotateXDeg).toBe(70);
    expect(geometry.horizonY).toBeCloseTo(130, 3);
    expect(geometry.farEdgeS).toBeCloseTo(2665.896, 2);
    expect(geometry.nearEdgeS).toBeCloseTo(545.896, 2);
  });

  it('solves subtleRamp golden values at an 800px visible height', () => {
    const geometry = solveGeometry(subtleRamp, { width: 1000, height: 800 });

    expect(geometry.perspectivePx).toBeCloseTo(102.64, 1);
    expect(geometry.transformOriginY).toBeCloseTo(497.778, 2);
    expect(geometry.horizonY).toBeCloseTo(320, 3);
    expect(geometry.farEdgeS).toBeCloseTo(1222.809, 2);
    expect(geometry.nearEdgeS).toBeCloseTo(-127.191, 2);
  });

  it('places the horizon exactly elevationFraction above the playhead line', () => {
    const visible = { width: 1000, height: 650 };
    const geometry = solveGeometry(noteHighway, visible);
    const playheadScreenY = noteHighway.playheadFraction * visible.height;
    const expectedHorizonY =
      playheadScreenY - noteHighway.elevationFraction * visible.height;

    expect(geometry.horizonY).toBeCloseTo(expectedHorizonY, 6);
  });
});

describe.each([
  {
    name: 'noteHighway',
    config: noteHighway,
    visible: { width: 1000, height: 650 },
  },
  {
    name: 'subtleRamp',
    config: subtleRamp,
    visible: { width: 1000, height: 800 },
  },
])('projection invariants ($name)', ({ config, visible }) => {
  const geometry = solveGeometry(config, visible);
  const sPlayhead = screenYToPlane(
    config.playheadFraction * visible.height,
    geometry,
  );

  it('widthAtPlane at the playhead distance equals the configured playheadWidth', () => {
    expect(widthAtPlane(sPlayhead, geometry)).toBeCloseTo(
      config.playheadWidth,
      6,
    );
  });

  it('planeToScreenY at the playhead distance equals playheadFraction × height', () => {
    const expectedY = config.playheadFraction * visible.height;

    expect(planeToScreenY(sPlayhead, geometry)).toBeCloseTo(expectedY, 6);
  });

  it('round-trips screenYToPlane(planeToScreenY(s)) back to s across a sweep', () => {
    const samples = [-500, -100, 0, 250, sPlayhead, 1000, 2000];

    for (const s of samples) {
      const y = planeToScreenY(s, geometry);
      expect(screenYToPlane(y, geometry)).toBeCloseTo(s, 4);
    }
  });

  it('sPlayhead matches farEdgeS/nearEdgeS minus their respective config offsets', () => {
    expect(geometry.farEdgeS - config.runwayLengthPx).toBeCloseTo(sPlayhead, 6);
    expect(geometry.nearEdgeS + config.overhangPx).toBeCloseTo(sPlayhead, 6);
  });
});

describe('degenerate configs', () => {
  it('falls back to flat identity geometry at tilt 0 instead of NaN', () => {
    const flatConfig: RunwayConfig = { ...noteHighway, tiltDeg: 0 };
    const geometry = solveGeometry(flatConfig, { width: 1000, height: 650 });

    expect(geometry.rotateXDeg).toBe(0);
    for (const value of Object.values(geometry)) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  it('produces finite values at a near-edge-on tilt of 89.9deg', () => {
    const steepConfig: RunwayConfig = { ...noteHighway, tiltDeg: 89.9 };
    const geometry = solveGeometry(steepConfig, { width: 1000, height: 650 });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('clamps tilt values at or above 90deg instead of producing Infinity', () => {
    const edgeOnConfig: RunwayConfig = { ...noteHighway, tiltDeg: 90 };
    const geometry = solveGeometry(edgeOnConfig, { width: 1000, height: 650 });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('clamps negative tilt to the flat boundary instead of mirroring it', () => {
    const negativeConfig: RunwayConfig = { ...noteHighway, tiltDeg: -70 };
    const geometry = solveGeometry(negativeConfig, {
      width: 1000,
      height: 650,
    });

    expect(geometry.rotateXDeg).toBe(0);
    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('produces finite values for a tiny 1px container height', () => {
    const geometry = solveGeometry(noteHighway, { width: 1000, height: 1 });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('produces finite values for a zero container height', () => {
    const geometry = solveGeometry(noteHighway, { width: 1000, height: 0 });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('produces finite values for a negative container height', () => {
    const geometry = solveGeometry(noteHighway, { width: 1000, height: -100 });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('produces finite values for a zero playheadWidth instead of Infinity/NaN', () => {
    const zeroWidthConfig: RunwayConfig = { ...noteHighway, playheadWidth: 0 };
    const geometry = solveGeometry(zeroWidthConfig, {
      width: 1000,
      height: 650,
    });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('produces finite values for a zero elevationFraction instead of NaN', () => {
    const zeroElevationConfig: RunwayConfig = {
      ...noteHighway,
      elevationFraction: 0,
    };
    const geometry = solveGeometry(zeroElevationConfig, {
      width: 1000,
      height: 650,
    });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }

    // The zero-elevation degenerate case is exactly where widthAtPlane and
    // screenYToPlane would previously divide 0/0 — exercise both directly.
    expect(Number.isFinite(widthAtPlane(0, geometry))).toBe(true);
    const playheadScreenY = zeroElevationConfig.playheadFraction * 650;
    expect(Number.isFinite(screenYToPlane(playheadScreenY, geometry))).toBe(
      true,
    );
  });

  it('produces a farEdgeS at or ahead of the playhead for a negative runwayLengthPx', () => {
    const negativeRunwayConfig: RunwayConfig = {
      ...noteHighway,
      runwayLengthPx: -500,
    };
    const geometry = solveGeometry(negativeRunwayConfig, {
      width: 1000,
      height: 650,
    });

    for (const value of Object.values(geometry)) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(geometry.farEdgeS).toBeGreaterThanOrEqual(geometry.nearEdgeS);
  });

  it('screenYToPlane at the horizon returns a large finite value instead of Infinity', () => {
    const geometry = solveGeometry(noteHighway, { width: 1000, height: 650 });

    const result = screenYToPlane(geometry.horizonY, geometry);

    expect(Number.isFinite(result)).toBe(true);
  });

  it('widthAtPlane behind the camera returns a large finite value instead of Infinity', () => {
    const geometry = solveGeometry(noteHighway, { width: 1000, height: 650 });
    const tiltRad = (geometry.rotateXDeg * Math.PI) / 180;
    const behindCameraS = -geometry.perspectivePx / Math.sin(tiltRad);

    const result = widthAtPlane(behindCameraS, geometry);

    expect(Number.isFinite(result)).toBe(true);
  });
});
