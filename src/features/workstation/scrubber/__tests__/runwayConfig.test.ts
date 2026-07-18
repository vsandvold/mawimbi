import { describe, expect, it } from 'vitest';

import { RUNWAY_PRESETS } from '../runwayConfig';
import {
  screenYToPlane,
  solveGeometry,
  widthAtPlane,
} from '../runwayProjection';

const VISIBLE_WIDTH_PX = 1000;
const HEIGHT_SWEEP_PX = [400, 600, 800, 1000, 1200];

describe.each(Object.entries(RUNWAY_PRESETS))('%s preset', (_name, config) => {
  it.each(HEIGHT_SWEEP_PX)(
    'solves finite geometry at a %ipx visible height',
    (height) => {
      const geometry = solveGeometry(config, {
        width: VISIBLE_WIDTH_PX,
        height,
      });

      for (const value of Object.values(geometry)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    },
  );

  it('widthAtPlane at the playhead distance equals the configured playheadWidth', () => {
    const visible = { width: VISIBLE_WIDTH_PX, height: 650 };
    const geometry = solveGeometry(config, visible);
    const sPlayhead = screenYToPlane(
      config.playheadFraction * visible.height,
      geometry,
    );

    expect(widthAtPlane(sPlayhead, geometry)).toBeCloseTo(
      config.playheadWidth,
      6,
    );
  });
});
