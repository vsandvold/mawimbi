import {
  GripVertical,
  Headphones,
  Loader2,
  Volume,
  Volume2,
} from 'lucide-react';
import { Slider } from '../../shared/ui/slider';
import { Button } from '../../shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import classNames from 'classnames';
import { useClassificationService } from '../classification/useClassificationService';
import { FALLBACK_LABEL } from '../classification/instrumentLabels';
import { type Track } from '../tracks/types';
import { SET_INSTRUMENT } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import './Channel.css';
import {
  getInstrumentDisplayName,
  getInstrumentIcon,
  SELECTABLE_INSTRUMENTS,
} from './instrumentIcons';
import { useChannelControls } from './useChannelControls';

type ChannelProps = {
  dragHandleProps?: Record<string, unknown>;
  isInstrumentDropdownOpen?: boolean;
  isMuted: boolean;
  onInstrumentDropdownOpenChange?: (open: boolean) => void;
  track: Track;
};

const PERCENT_DIVISOR = 100;
const PRIMARY_POINTER_BUTTON = 0;

const Channel = ({
  isMuted,
  isInstrumentDropdownOpen,
  onInstrumentDropdownOpenChange,
  track,
  dragHandleProps = {},
}: ChannelProps) => {
  const { trackId, color } = track;
  const dispatch = useProjectDispatch();

  const {
    volume,
    mute,
    solo,
    startFocus,
    endFocus,
    updateVolume,
    commitVolume,
    cycleState,
  } = useChannelControls(trackId);

  const { getClassification, getClassificationState, downloadProgress } =
    useClassificationService();
  const classificationState = getClassificationState(trackId);
  const instrument =
    getClassification(trackId)?.label ??
    track.instrument ??
    (classificationState === 'error' ? FALLBACK_LABEL : undefined);
  const isDownloading =
    classificationState === 'classifying' && downloadProgress !== null;
  const isClassifying = classificationState === 'classifying';

  const handleSelectInstrument = (label: string) => {
    dispatch([SET_INSTRUMENT, { trackId, instrument: label }]);
  };

  const handleValueChange = (values: number[]) => {
    updateVolume(values[0]);
  };

  const handleValueCommit = (values: number[]) => {
    commitVolume(values[0]);
  };

  const handleFocusPointerDown = (event: React.PointerEvent) => {
    // Non-primary presses (right/middle click) open the context menu,
    // which swallows the matching pointerup — never start a focus that
    // nothing can end.
    if (event.button !== PRIMARY_POINTER_BUTTON) return;
    startFocus();
  };

  const { r, g, b } = color;
  const channelOpacity = isMuted ? 0 : convertToOpacity(volume);
  const isInverted = channelOpacity < 0.5 || mute;
  const channelColor = `rgba(${r},${g},${b}, ${channelOpacity})`;

  return (
    <div
      className={classNames('channel', {
        'channel--inverted': isInverted,
      })}
      style={{
        backgroundColor: channelColor,
      }}
    >
      <DropdownMenu
        modal={false}
        open={isInstrumentDropdownOpen}
        onOpenChange={onInstrumentDropdownOpenChange}
      >
        <DropdownMenuTrigger asChild disabled={isClassifying}>
          <button
            className="channel__instrument"
            title={
              isDownloading
                ? `Downloading model: ${downloadProgress}%`
                : instrument
                  ? getInstrumentDisplayName(instrument)
                  : undefined
            }
          >
            {isClassifying ? (
              isDownloading ? (
                <span className="channel__download-progress">
                  {downloadProgress}%
                </span>
              ) : (
                <Loader2 className="animate-spin" />
              )
            ) : (
              instrument !== undefined && getInstrumentIcon(instrument)
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start">
          {SELECTABLE_INSTRUMENTS.map((label) => (
            <DropdownMenuItem
              key={label}
              className={classNames('channel__instrument-option', {
                'channel__instrument-option--selected': instrument === label,
              })}
              onSelect={() => handleSelectInstrument(label)}
            >
              {getInstrumentIcon(label)}
              <span>{getInstrumentDisplayName(label)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="channel__mute-solo">
        <Button
          variant="ghost"
          size="icon"
          className={classNames('channel-button', {
            'channel-button--active': mute || solo,
          })}
          title={getChannelStateTitle(mute, solo)}
          onClick={cycleState}
        >
          {getChannelStateIcon(mute, solo)}
        </Button>
      </div>
      {/* Focus follows the pointer lifecycle, not slider value events —
          why: see useChannelControls. The terminal events bubble here from
          Radix's pointer capture; lostpointercapture covers interruptions
          (OS focus steal) that deliver neither up nor cancel. */}
      <div
        className="channel__volume"
        onPointerDown={handleFocusPointerDown}
        onPointerUp={endFocus}
        onPointerCancel={endFocus}
        onLostPointerCapture={endFocus}
      >
        <Slider
          className="channel-slider"
          value={[volume]}
          min={0}
          max={100}
          onValueChange={handleValueChange}
          onValueCommit={handleValueCommit}
        />
      </div>
      <div className="channel__move" {...dragHandleProps}>
        <Button
          variant="ghost"
          size="icon"
          className="channel-button"
          style={{ pointerEvents: 'none' }}
          title="Move"
          disabled
        >
          <GripVertical />
        </Button>
      </div>
    </div>
  );
};

function getChannelStateIcon(mute: boolean, solo: boolean) {
  if (solo) return <Headphones />;
  if (mute) return <Volume />;
  return <Volume2 />;
}

function getChannelStateTitle(mute: boolean, solo: boolean) {
  if (solo) return 'Solo';
  if (mute) return 'Muted';
  return 'On';
}

function convertToOpacity(value: number): number {
  return parseFloat((value / PERCENT_DIVISOR).toFixed(2));
}

export default Channel;
