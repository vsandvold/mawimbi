import {
  GripVertical,
  Headphones,
  Loader2,
  Volume,
  Volume2,
} from 'lucide-react';
import { Slider } from '../ui/slider';
import { Button } from '../ui/button';
import classNames from 'classnames';
import { useClassificationService } from '../../hooks/useClassificationService';
import { FALLBACK_LABEL } from '../../services/instrumentLabels';
import { type Track } from '../../types/track';
import './Channel.css';
import { getInstrumentIcon } from './instrumentIcons';
import { useChannelControls } from './useChannelControls';

type ChannelProps = {
  dragHandleProps?: Record<string, unknown>;
  isMuted: boolean;
  track: Track;
};

const PERCENT_DIVISOR = 100;

const Channel = ({ isMuted, track, dragHandleProps = {} }: ChannelProps) => {
  const { trackId, color } = track;

  const {
    volume,
    mute,
    solo,
    startFocus,
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

  const handleValueChange = (values: number[]) => {
    updateVolume(values[0]);
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
      <div
        className="channel__instrument"
        title={
          isDownloading ? `Downloading model: ${downloadProgress}%` : undefined
        }
      >
        {classificationState === 'classifying' ? (
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
      </div>
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
      <div className="channel__volume" onPointerDown={startFocus}>
        <Slider
          className="channel-slider"
          defaultValue={[volume]}
          min={0}
          max={100}
          onValueChange={handleValueChange}
          onValueCommit={commitVolume}
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
