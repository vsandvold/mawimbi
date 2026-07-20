import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../shared/ui/button';
import { Slider } from '../../shared/ui/slider';
import {
  EFFECT_ORDER,
  MAX_EFFECT_AMOUNT,
  MIN_EFFECT_AMOUNT,
  type EffectId,
} from '../tracks/EffectsChain';
import { type Track, type TrackId } from '../tracks/types';
import BottomSheet from './BottomSheet';
import { getInstrumentDisplayName, getInstrumentIcon } from './instrumentIcons';
import { useEditMode } from './useEditMode';
import { useEffectControls } from './useEffectControls';
import './EffectsBottomSheet.css';

const EFFECT_LABELS: Record<EffectId, string> = {
  space: 'Space',
  echo: 'Echo',
  tone: 'Tone',
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
      <EffectSliders trackId={activeTrack.trackId} />
    </div>
  );
};

type EffectSlidersProps = {
  trackId: TrackId;
};

const EffectSliders = ({ trackId }: EffectSlidersProps) => {
  const { amounts, updateAmount } = useEffectControls(trackId);

  return (
    <div className="effects-bottom-sheet__sliders">
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
          />
        </label>
      ))}
    </div>
  );
};

export default EffectsBottomSheet;
