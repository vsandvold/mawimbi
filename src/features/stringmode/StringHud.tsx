// SPIKE (mawimbi#593) — the on-screen `fps` / `fills per frame` readout,
// and the entry point to the parameter overlay.
//
// The HUD is not decoration: spike question 6 asks whether the ~2–4 ms
// per-frame estimate holds on a real mid-range phone, and there is no
// devtools on a phone. Fill count is the number that actually moves as the
// parameters are swept, so it is the one worth putting on screen.

import { Copy, Settings2, X } from 'lucide-react';
import { type RefObject } from 'react';
import { Button } from '../../shared/ui/button';
import useMessage from '../../shared/message';
import StringTuningOverlay from './StringTuningOverlay';
import { useStringMode } from './useStringMode';
import { DEFAULT_STRING_PARAMS } from './stringParams';

type StringHudProps = { hudRef: RefObject<HTMLPreElement | null> };

const SERIALIZE_PRECISION = 3;

const StringHud = ({ hudRef }: StringHudProps) => {
  const stringMode = useStringMode();
  const message = useMessage();

  const handleCopyParams = async () => {
    try {
      await navigator.clipboard.writeText(serializeParams(stringMode.params));
      message('String params copied to clipboard', { type: 'success' });
    } catch {
      message('Could not copy params to clipboard', { type: 'error' });
    }
  };

  return (
    <div className="string-hud">
      <div className="string-hud__bar">
        <pre ref={hudRef} className="string-hud__readout">
          — fps · — fills
        </pre>
        <Button
          variant="ghost"
          size="icon-sm"
          title="String mode parameters"
          onClick={stringMode.toggleOverlay}
        >
          {stringMode.isOverlayOpen ? <X /> : <Settings2 />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Copy params"
          onClick={handleCopyParams}
        >
          <Copy />
        </Button>
      </div>
      {stringMode.isOverlayOpen && (
        <StringTuningOverlay
          params={stringMode.params}
          setValue={stringMode.setValue}
          reset={stringMode.reset}
        />
      )}
    </div>
  );
};

/** Serializes the swept values as a `stringParams.ts`-shaped snippet, so a
 *  setting found on the phone can come back as a one-line diff. */
function serializeParams(params: typeof DEFAULT_STRING_PARAMS): string {
  const fields = Object.entries(params)
    .map(
      ([key, value]) =>
        `  ${key}: ${Number(value.toFixed(SERIALIZE_PRECISION))},`,
    )
    .join('\n');
  return `export const DEFAULT_STRING_PARAMS: StringParams = {\n${fields}\n};`;
}

export default StringHud;
