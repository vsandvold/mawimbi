import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import { SliderValue } from 'antd/lib/slider';
import React, { useEffect, useRef } from 'react';
import useDebounced from '../../hooks/useDebounced';
import useThrottled from '../../hooks/useThrottled';
import AudioService, { AudioServiceChannel } from '../../services/AudioService';
import useProjectContext from '../project/useProjectContext';
import {
  SET_TRACK_MUTE,
  SET_TRACK_SOLO,
  SET_TRACK_VOLUME,
  Track,
} from '../project/useProjectState';
import './Channel.css';
import useWorkstationContext from './useWorkstationContext';
import { SET_TRACK_FOCUS, SET_TRACK_UNFOCUS } from './useWorkstationState';

type ChannelProps = {
  isMuted: boolean;
  track: Track;
};

const Channel = ({ isMuted, track }: ChannelProps) => {
  console.log('Channel render');

  const [projectDispatch] = useProjectContext();
  const [workstationDispatch] = useWorkstationContext();

  const channelRef = useRef<AudioServiceChannel | null>(null);

  const { id: trackId, audioBuffer, color, volume, mute, solo } = track;

  useEffect(() => {
    channelRef.current = AudioService.createChannel(audioBuffer);
    return () => {
      if (channelRef.current) {
        channelRef.current.dispose();
      }
    };
  }, [audioBuffer]);

  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.volume.rampTo(convertToDecibel(volume), 0.1);
    }
  }, [volume]);

  function convertToDecibel(value: number) {
    return 20 * Math.log((value + 1) / 101);
  }

  const unfocusTrack = () => {
    workstationDispatch([SET_TRACK_UNFOCUS, trackId]);
  };

  const debouncedUnfocusTrack = useDebounced(unfocusTrack, { timeoutMs: 250 });

  const updateVolume = (value: SliderValue) => {
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

  const updateMove = () => {};

  function convertToOpacity(value: number) {
    return parseFloat((value / 100).toFixed(2));
  }

  const { r, g, b } = color;
  const channelOpacity = isMuted ? 0 : convertToOpacity(volume);
  const channelColor = `rgba(${r},${g},${b}, ${channelOpacity})`;

  return (
    <div
      className="channel"
      style={{
        backgroundColor: channelColor,
      }}
    >
      <div className="channel__swipe"></div>
      <div className="channel__solo">
        <Button
          style={getButtonStyle(channelOpacity, solo)}
          icon={<CustomerServiceOutlined />}
          type="link"
          ghost
          title="Solo"
          onClick={updateSolo}
        />
      </div>
      <div className="channel__mute">
        <Button
          style={getButtonStyle(channelOpacity, mute)}
          icon={<SoundOutlined />}
          type="link"
          ghost
          title="Mute"
          onClick={updateMute}
        />
      </div>
      <div className="channel__volume">
        <Slider
          defaultValue={volume}
          min={0}
          max={100}
          onChange={throttledUpdateVolume}
        />
      </div>
      <div className="channel__move">
        <Button
          style={getButtonStyle(channelOpacity)}
          icon={<MenuOutlined />}
          type="link"
          ghost
          title="Move"
          onClick={updateMove}
        />
      </div>
    </div>
  );
};

function getButtonStyle(channelOpacity: number, isActive = false) {
  const buttonOpacity = isActive ? 1 : 0.65;
  const buttonColor =
    channelOpacity < 0.5
      ? `rgba(255, 255, 255, ${buttonOpacity})`
      : `rgba(0, 0, 0, ${buttonOpacity})`;
  return { color: buttonColor, transition: 'color 0.5s' };
}

export default Channel;
