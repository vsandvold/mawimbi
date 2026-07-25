import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../shared/ui/button';
import { Slider } from '../../shared/ui/slider';
import {
  formatBpm,
  selectConfidentTempo,
  type TrackTempo,
} from '../rhythm/tempo';
import {
  EFFECT_ORDER,
  MAX_EFFECT_AMOUNT,
  MIN_EFFECT_AMOUNT,
  type EffectId,
} from '../tracks/EffectsChain';
import { ECHO_SUBDIVISIONS, type EchoSubdivision } from '../tracks/echoSync';
import { type Track, type TrackId } from '../tracks/types';
import BottomSheet from './BottomSheet';
import { getInstrumentDisplayName, getInstrumentIcon } from './instrumentIcons';
import { useEditMode } from './useEditMode';
import { useEffectControls } from './useEffectControls';
import './EffectsBottomSheet.css';

const EFFECT_LABELS: Record<EffectId, string> = {
  crush: 'Crush',
  space: 'Space',
  echo: 'Echo',
  tone: 'Tone',
};

// Note glyphs, not DSP vocabulary — the Chrome Music Lab / Learning Music
// bar the spec calibrates its controls against (spec 007 Grounding). The
// spelled-out `name` carries the same thing for the accessible title, since
// a screen reader reading "♩." is not informative.
const SUBDIVISION_LABELS: Record<
  EchoSubdivision,
  { glyph: string; name: string }
> = {
  quarter: { glyph: '♩', name: 'quarter notes' },
  dottedEighth: { glyph: '♪.', name: 'dotted eighth notes' },
  eighth: { glyph: '♪', name: 'eighth notes' },
  eighthTriplet: { glyph: '♪³', name: 'eighth-note triplets' },
};

type EffectsBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onHeightChange: (height: number) => void;
  tracks: Track[];
};

const EffectsBottomSheet = ({
  isOpen,
  onOpenChange,
  onHeightChange,
  tracks,
}: EffectsBottomSheetProps) => (
  <BottomSheet
    isOpen={isOpen}
    onOpenChange={onOpenChange}
    onHeightChange={onHeightChange}
    title="Effects"
  >
    <EffectsBottomSheetContent tracks={tracks} />
  </BottomSheet>
);

type EffectsBottomSheetContentProps = {
  tracks: Track[];
};

const EffectsBottomSheetContent = ({
  tracks,
}: EffectsBottomSheetContentProps) => {
  const { activeEditTrackId, cycleActiveTrack } = useEditMode();
  const trackIds = useMemo(
    () => tracks.map((track) => track.trackId),
    [tracks],
  );
  const activeIndex = tracks.findIndex(
    (track) => track.trackId === activeEditTrackId,
  );
  const activeTrack = tracks[activeIndex];

  if (!activeTrack) return null;

  const { r, g, b } = activeTrack.color;
  // Absent, not disabled, when the estimate isn't trustworthy: a track with
  // no confident tempo shows nothing rather than a greyed-out mystery (spec
  // 007 Decision 4). Showing the number when there *is* one also keeps an
  // octave error (2×/½×, endemic to tempo estimators) visible.
  const tempo = selectConfidentTempo(activeTrack.tempo);

  return (
    <div className="effects-bottom-sheet">
      <div className="effects-bottom-sheet__header">
        <div className="effects-bottom-sheet__identity">
          <span
            className="effects-bottom-sheet__color"
            style={{ backgroundColor: `rgb(${r},${g},${b})` }}
          />
          <span
            className="effects-bottom-sheet__instrument"
            title={
              activeTrack.instrument
                ? getInstrumentDisplayName(activeTrack.instrument)
                : undefined
            }
          >
            {getInstrumentIcon(activeTrack.instrument)}
          </span>
          <span className="effects-bottom-sheet__filename">
            {activeTrack.fileName}
          </span>
          {tempo && (
            <span
              className="effects-bottom-sheet__tempo"
              title="Estimated tempo"
            >
              {formatBpm(tempo.bpm)}
            </span>
          )}
        </div>
        <div className="effects-bottom-sheet__nav">
          <Button
            variant="outline"
            size="icon"
            title="Previous track"
            onClick={() => cycleActiveTrack(trackIds, 'previous')}
            disabled={activeIndex <= 0}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Next track"
            onClick={() => cycleActiveTrack(trackIds, 'next')}
            disabled={activeIndex >= trackIds.length - 1}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <EffectSliders
        trackId={activeTrack.trackId}
        tempo={activeTrack.tempo}
        echoSubdivision={activeTrack.echoSync}
      />
    </div>
  );
};

type EffectSlidersProps = {
  trackId: TrackId;
  tempo: TrackTempo | undefined;
  echoSubdivision: EchoSubdivision | undefined;
};

const EffectSliders = ({
  trackId,
  tempo,
  echoSubdivision,
}: EffectSlidersProps) => {
  const { amounts, updateAmount, commitAmount, setEchoSubdivision, endDrag } =
    useEffectControls(trackId, tempo, echoSubdivision);
  // Same gate as the BPM badge above — no confident tempo means the
  // subdivision control is *absent*, not disabled: there is nothing to sync
  // to, and a dead control would be a mystery rather than an explanation
  // (spec 007 Goal 5).
  const canSync = selectConfidentTempo(tempo) !== null;

  return (
    // Preview-overlay teardown follows the pointer lifecycle, not slider
    // value events — same reason as Channel.tsx's volume-fader focus:
    // Radix's onValueCommit doesn't fire when a drag releases back at the
    // value it started from (useEffectControls.ts, endDrag). One wrapper
    // for every slider is enough since only one can be dragged by a given
    // pointer at a time.
    <div
      className="effects-bottom-sheet__sliders"
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {EFFECT_ORDER.map((effectId) => (
        <label key={effectId} className="effects-bottom-sheet__effect">
          <span className="effects-bottom-sheet__effect-label">
            {EFFECT_LABELS[effectId]}
          </span>
          <Slider
            aria-label={`${EFFECT_LABELS[effectId]} amount`}
            value={[amounts[effectId]]}
            min={MIN_EFFECT_AMOUNT}
            max={MAX_EFFECT_AMOUNT}
            onValueChange={(values) => updateAmount(effectId, values[0])}
            onValueCommit={(values) => commitAmount(effectId, values[0])}
          />
          {effectId === 'echo' && canSync && (
            <EchoSubdivisions
              selected={echoSubdivision ?? null}
              onSelect={setEchoSubdivision}
            />
          )}
        </label>
      ))}
    </div>
  );
};

type EchoSubdivisionsProps = {
  selected: EchoSubdivision | null;
  onSelect: (subdivision: EchoSubdivision | null) => void;
};

// Shares the Echo row rather than taking a row of its own: `.bottom-sheet`
// clips instead of scrolling, and four macro rows plus the header already
// fill the 160px small snap — a fifth row disappeared off the bottom the
// last time one was added (`/code-review` on PR #578; the invariant is
// measured in `e2e/track-effects.spec.ts`).
const EchoSubdivisions = ({ selected, onSelect }: EchoSubdivisionsProps) => (
  <div
    className="effects-bottom-sheet__sync"
    role="group"
    aria-label="Echo sync"
  >
    {ECHO_SUBDIVISIONS.map((subdivision) => {
      const isSelected = subdivision === selected;
      return (
        <button
          key={subdivision}
          type="button"
          className="effects-bottom-sheet__sync-option"
          aria-pressed={isSelected}
          title={`Echo in ${SUBDIVISION_LABELS[subdivision].name}`}
          // Tapping the selected one turns sync off — the control is its own
          // on/off, so there is no separate toggle to keep in step with it.
          onClick={() => onSelect(isSelected ? null : subdivision)}
        >
          {SUBDIVISION_LABELS[subdivision].glyph}
        </button>
      );
    })}
  </div>
);

export default EffectsBottomSheet;
