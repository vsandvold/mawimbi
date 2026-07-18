import { type CSSProperties } from 'react';

type ScrubberFogProps = {
  style: CSSProperties;
};

/**
 * Atmospheric fog overlay that fades the runway into the horizon.
 *
 * Positioned in screen space, not tilted — it represents distance fog,
 * not a physical plane. Its gradient (computed by
 * `useScrubberGeometry.getFogStyle`) is anchored to the solved `horizonY`
 * and playhead position, so the fog band tracks the runway's actual
 * anchors instead of a fixed fraction of the container.
 */
function ScrubberFog({ style }: ScrubberFogProps) {
  return <div className="scrubber__fog" style={style} />;
}

export default ScrubberFog;
