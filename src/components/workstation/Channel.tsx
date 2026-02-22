import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import classNames from 'classnames';
import React from 'react';
import useDebounced from '../../hooks/useDebounced';
import { TrackSignalStore } from '../../signals/trackSignals';
import { Track } from '../project/projectPageReducer';
import './Channel.css';
import useWorkstationDispatch from './useWorkstationDispatch';
import { SET_TRACK_FOCUS, SET_TRACK_UNFOCUS } from './workstationReducer';

type ChannelProps = {
  dragHandleProps?: Record<string, unknown>;
  isMuted: boolean;
  track: Track;
};

const DEFAULT_VOLUME = 100;

const Channel = ({ isMuted, track, dragHandleProps = {} }: ChannelProps) => {
  const workstationDispatch = useWorkstationDispatch();

  const { trackId, color } = track;

  const trackSignals = TrackSignalStore.get(trackId);
  const volume = trackSignals?.volume.value ?? DEFAULT_VOLUME;
  const mute = trackSignals?.mute.value ?? false;
  const solo = trackSignals?.solo.value ?? false;

  const updateVolume = (value: number) => {
    if (trackSignals) {
      trackSignals.volume.value = value;
    }
    workstationDispatch([SET_TRACK_FOCUS, trackId]);
    debouncedUnfocusTrack();
  };

  const unfocusTrack = () => {
    workstationDispatch([SET_TRACK_UNFOCUS, trackId]);
  };
  const debouncedUnfocusTrack = useDebounced(unfocusTrack, { timeoutMs: 250 });

  const updateMute = () => {
    if (trackSignals) {
      trackSignals.mute.value = !mute;
    }
  };

  const updateSolo = () => {
    if (trackSignals) {
      trackSignals.solo.value = !solo;
    }
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
      <div className="channel__swipe"></div>
      <div className="channel__solo">
        <Button
          className={classNames('channel-button', {
            'channel-button--active': solo,
          })}
          icon={<CustomerServiceOutlined />}
          type="link"
          title="Solo"
          onClick={updateSolo}
        />
      </div>
      <div className="channel__mute">
        <Button
          className={classNames('channel-button', {
            'channel-button--active': mute,
          })}
          icon={<SoundOutlined />}
          type="link"
          title="Mute"
          onClick={updateMute}
        />
      </div>
      <div className="channel__volume">
        <Slider
          className="channel-slider"
          defaultValue={volume}
          min={0}
          max={100}
          onChange={updateVolume}
        />
      </div>
      <div className="channel__move" {...dragHandleProps}>
        <Button
          className="channel-button"
          style={{ pointerEvents: 'none' }}
          icon={<MenuOutlined />}
          type="link"
          title="Move"
          disabled
        />
      </div>
    </div>
  );
};

function convertToOpacity(value: number): number {
  return parseFloat((value / 100).toFixed(2));
}

export default Channel;
