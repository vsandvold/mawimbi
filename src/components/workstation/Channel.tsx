import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import classNames from 'classnames';
import React, { useEffect } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import useDebounced from '../../hooks/useDebounced';
import useThrottled from '../../hooks/useThrottled';
import {
  SET_TRACK_MUTE,
  SET_TRACK_SOLO,
  SET_TRACK_VOLUME,
  Track,
} from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import './Channel.css';
import useWorkstationDispatch from './useWorkstationDispatch';
import { SET_TRACK_FOCUS, SET_TRACK_UNFOCUS } from './workstationReducer';

type ChannelProps = {
  isMuted: boolean;
  track: Track;
};

const Channel = ({ isMuted, track, ...dragHandleProps }: ChannelProps) => {
  const audioService = useAudioService();
  const projectDispatch = useProjectDispatch();
  const workstationDispatch = useWorkstationDispatch();

  const { trackId, color, volume, mute, solo } = track;

  useEffect(() => {
    const channel = audioService.mixer.retrieveChannel(trackId);
    if (channel) {
      channel.volume.rampTo(convertToDecibel(volume), 0.1);
    }
  }, [trackId, volume]);

  const unfocusTrack = () => {
    workstationDispatch([SET_TRACK_UNFOCUS, trackId]);
  };

  const debouncedUnfocusTrack = useDebounced(unfocusTrack, { timeoutMs: 250 });

  const updateVolume = (value: number) => {
    projectDispatch([SET_TRACK_VOLUME, { id: trackId, volume: value }]);
    workstationDispatch([SET_TRACK_FOCUS, trackId]);
    debouncedUnfocusTrack();
  };

  const throttledUpdateVolume = useThrottled(updateVolume, { timeoutMs: 100 });

  const updateMute = () => {
    projectDispatch([SET_TRACK_MUTE, { id: trackId, mute: !mute }]);
  };

  useEffect(() => {
    const channel = audioService.mixer.retrieveChannel(trackId);
    if (channel) {
      channel.mute = mute;
    }
  }, [trackId, mute]);

  const updateSolo = () => {
    projectDispatch([SET_TRACK_SOLO, { id: trackId, solo: !solo }]);
  };

  useEffect(() => {
    const channel = audioService.mixer.retrieveChannel(trackId);
    if (channel) {
      channel.solo = solo;
    }
  }, [trackId, solo]);

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
          onChange={throttledUpdateVolume}
          handleStyle={{}}
          trackStyle={{}}
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

function convertToDecibel(value: number): number {
  return 20 * Math.log((value + 1) / 101);
}

function convertToOpacity(value: number): number {
  return parseFloat((value / 100).toFixed(2));
}

export default Channel;
