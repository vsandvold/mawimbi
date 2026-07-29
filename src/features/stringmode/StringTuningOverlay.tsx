// SPIKE (mawimbi#593) — live parameter sweep for String mode.
//
// Twenty-plus tunables cannot be swept by editing code and redeploying:
// spike questions 1–13 are *all* parameter sweeps, and the whole point of
// evaluating on a real phone is that the answers are perceptual. This is
// what makes the spike able to answer them at all, so it is scope rather
// than polish — the same rationale `useTuningActivation`'s doc comment
// already states for the runway's overlay.
//
// Rows are plain `<div>`s, **never `<label>`s**: a `<label>` resolves its
// control to its first *labelable* descendant, and Radix's slider root is a
// `<span role="slider">` — not labelable — so a label wrapping one is inert
// until any button joins it, at which point every drag on the slider
// silently activates that button (#560). jsdom does not model that
// forwarding, so it cannot be caught behaviourally by a unit test.

import { RotateCcw } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import { Slider } from '../../shared/ui/slider';
import {
  formatParamValue,
  STRING_PARAM_SPECS,
  type StringParamKey,
  type StringParams,
} from './stringParams';

type StringTuningOverlayProps = {
  params: StringParams;
  setValue: (key: StringParamKey, value: number) => void;
  reset: () => void;
};

const StringTuningOverlay = ({
  params,
  setValue,
  reset,
}: StringTuningOverlayProps) => {
  return (
    <div className="string-tuning">
      <div className="string-tuning__header">
        <span className="string-tuning__title">String mode</span>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Reset to defaults"
          onClick={reset}
        >
          <RotateCcw />
        </Button>
      </div>
      <div className="string-tuning__knobs">
        {STRING_PARAM_SPECS.map((spec) => (
          <div key={spec.key} className="string-tuning__knob">
            <span className="string-tuning__knob-label">
              {spec.label}
              <span className="string-tuning__knob-value">
                {formatParamValue(spec, params[spec.key])}
              </span>
            </span>
            <Slider
              // Controlled, not `defaultValue`: `reset` changes the bound
              // value from outside the drag, and Radix ignores further
              // `defaultValue` changes after mount (CLAUDE.md).
              value={[params[spec.key]]}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              onValueChange={([value]) => setValue(spec.key, value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default StringTuningOverlay;
