import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import classNames from 'classnames';
import React, { useEffect, useRef } from 'react';
import { useAudioService } from '../../hooks/useAudioService';
import useDebounced from '../../hooks/useDebounced';
import useThrottled from '../../hooks/useThrottled';
import { AudioServiceChannel } from '../../services/AudioService';
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

  const channelRef = useRef<AudioServiceChannel | null>(null);

  const { id: trackId, audioBuffer, color, volume, mute, solo } = track;

  useEffect(() => {
    channelRef.current = audioService.createChannel(audioBuffer);
    return () => {
      if (channelRef.current) {
        channelRef.current.dispose();
      }
    };
  }, [audioBuffer]); // audioService never changes, and can safely be omitted from dependencies

  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.volume.rampTo(convertToDecibel(volume), 0.1);
    }
  }, [volume]);

  const unfocusTrack = () => {
    workstationDispatch([SET_TRACK_UNFOCUS, trackId]);
  };

  const debouncedUnfocusTrack = useDebounced(unfocusTrack, { timeoutMs: 250 });

  const updateVolume = (value: number) => {
    if (channelRef.current) {
      projectDispatch([SET_TRACK_VOLUME, { id: trackId, volume: value }]);
      workstationDispatch([SET_TRACK_FOCUS, trackId]);
      debouncedUnfocusTrack();
    }
  };

  const throttledUpdateVolume = useThrottled(updateVolume, { timeoutMs: 100 });

  const updateMute = () => {
    projectDispatch([SET_TRACK_MUTE, { id: trackId, mute: !mute }]);
  };

  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.mute = mute;
    }
  }, [mute]);

  const updateSolo = () => {
    projectDispatch([SET_TRACK_SOLO, { id: trackId, solo: !solo }]);
  };

  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.solo = solo;
    }
  }, [solo]);

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
