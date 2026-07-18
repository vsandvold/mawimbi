import { Copy, X } from 'lucide-react';
import { Button } from '../../../shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shared/ui/dropdown-menu';
import { Slider } from '../../../shared/ui/slider';
import useMessage from '../../../shared/message';
import { type RunwayPreset } from './runwayConfig';
import { type RunwayGeometry } from './runwayProjection';
import { useTuningOverlay } from './useTuningOverlay';
import './TuningOverlay.css';

type KnobSpec = {
  key:
    | 'tiltDeg'
    | 'playheadFraction'
    | 'playheadWidth'
    | 'elevationFraction'
    | 'runwayLengthPx'
    | 'overhangPx';
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
};

// One slider per RunwayConfig knob (mawimbi#447) — ranges follow the safe
// ranges documented on RunwayConfig itself (runwayProjection.ts), widened
// slightly where a shipped preset's value sits at the documented edge.
const KNOBS: readonly KnobSpec[] = [
  { key: 'tiltDeg', label: 'Tilt', min: 0, max: 85, step: 1, unit: 'deg' },
  {
    key: 'playheadFraction',
    label: 'Playhead position',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '',
  },
  {
    key: 'playheadWidth',
    label: 'Playhead width',
    min: 0.4,
    max: 1,
    step: 0.01,
    unit: '',
  },
  {
    key: 'elevationFraction',
    label: 'Elevation',
    min: 0.05,
    max: 1,
    step: 0.01,
    unit: '',
  },
  {
    key: 'runwayLengthPx',
    label: 'Runway length',
    min: 200,
    max: 4000,
    step: 50,
    unit: 'px',
  },
  {
    key: 'overhangPx',
    label: 'Overhang',
    min: 0,
    max: 1000,
    step: 10,
    unit: 'px',
  },
];

const SERIALIZE_PRECISION = 4;

type TuningOverlayProps = {
  geometry: RunwayGeometry;
};

/**
 * Dev-only overlay for tuning `RunwayConfig` live (mawimbi#447) — ends the
 * "tune by PR" cycle six prior PRs went through, each requiring a commit
 * and deploy just to see the result of one parameter change.
 *
 * Every control writes through `tuningSignals`' config-override signal,
 * which `useScrubberGeometry` composes over `activeRunwayConfig` — this
 * overlay never touches CSS directly, so what you tune here is exactly
 * what a preset (runwayConfig.ts) can persist.
 */
function TuningOverlay({ geometry }: TuningOverlayProps) {
  const { config, presets, close, selectPreset, setValue } = useTuningOverlay();
  const message = useMessage();

  if (!config) return null;

  const handleCopyPreset = async () => {
    await navigator.clipboard.writeText(serializePreset(config));
    message('Preset copied to clipboard', { type: 'success' });
  };

  return (
    <div className="tuning-overlay">
      <div className="tuning-overlay__header">
        <span className="tuning-overlay__title">Runway tuning</span>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Close tuning overlay"
          onClick={close}
        >
          <X />
        </Button>
      </div>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="tuning-overlay__preset"
          >
            Preset
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start">
          {Object.entries(presets).map(([name, preset]) => (
            <DropdownMenuItem key={name} onSelect={() => selectPreset(preset)}>
              {name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {KNOBS.map((knob) => (
        <label key={knob.key} className="tuning-overlay__knob">
          <span className="tuning-overlay__knob-label">
            {knob.label}
            <span className="tuning-overlay__knob-value">
              {formatKnobValue(config[knob.key], knob.unit)}
            </span>
          </span>
          <Slider
            value={[config[knob.key]]}
            min={knob.min}
            max={knob.max}
            step={knob.step}
            onValueChange={([value]) => setValue(knob.key, value)}
          />
        </label>
      ))}

      <dl className="tuning-overlay__readout">
        <dt>perspectivePx</dt>
        <dd>{formatReadoutValue(geometry.perspectivePx)}</dd>
        <dt>perspectiveOriginY</dt>
        <dd>{formatReadoutValue(geometry.perspectiveOriginY)}</dd>
        <dt>transformOriginY</dt>
        <dd>{formatReadoutValue(geometry.transformOriginY)}</dd>
        <dt>horizonY</dt>
        <dd>{formatReadoutValue(geometry.horizonY)}</dd>
      </dl>

      <Button
        variant="outline"
        size="sm"
        className="tuning-overlay__copy"
        onClick={handleCopyPreset}
      >
        <Copy />
        Copy preset
      </Button>
    </div>
  );
}

function formatKnobValue(value: number, unit: string): string {
  return unit ? `${value}${unit}` : `${value}`;
}

function formatReadoutValue(value: number): string {
  return `${value.toFixed(1)}px`;
}

/** Serializes the current config as a `runwayConfig.ts`-shaped preset snippet. */
function serializePreset(config: RunwayPreset): string {
  const fields = Object.entries(config)
    .map(([key, value]) => `  ${key}: ${roundForExport(value)},`)
    .join('\n');
  return `export const custom: RunwayPreset = {\n${fields}\n};`;
}

function roundForExport(value: number): number {
  return Number(value.toFixed(SERIALIZE_PRECISION));
}

export default TuningOverlay;
