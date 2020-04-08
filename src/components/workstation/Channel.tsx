import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import { SliderValue } from 'antd/lib/slider';
import React, { useEffect, useRef, useState } from 'react';
import useDebounced from '../../hooks/useDebounced';
import useThrottled from '../../hooks/useThrottled';
import AudioService from '../../services/AudioService';
import useProjectContext from '../project/useProjectContext';
import { SET_TRACK_VOLUME, Track } from '../project/useProjectState';
import './Channel.css';
import useWorkstationContext from './useWorkstationContext';
import { SET_TRACK_FOCUS, SET_TRACK_UNFOCUS } from './useWorkstationState';

type ChannelProps = {
  track: Track;
};

const Channel = ({ track }: ChannelProps) => {
  console.log('Channel render');

  const [projectDispatch] = useProjectContext();
  const [workstationDispatch] = useWorkstationContext();

  const channelRef = useRef<Tone.Channel | null>(null);

  const { id: trackId, audioBuffer, color, volume } = track;

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

  const debouncedUnfocusTrack = useDebounced(unfocusTrack, { timeoutMs: 200 });

  const updateVolume = (value: SliderValue) => {
    if (channelRef.current) {
      projectDispatch([SET_TRACK_VOLUME, { id: trackId, volume: value }]);
      workstationDispatch([SET_TRACK_FOCUS, trackId]);
      debouncedUnfocusTrack();
    }
  };

  const throttledUpdateVolume = useThrottled(updateVolume, { timeoutMs: 100 });

  const [isMuted, setIsMuted] = useState(false);

  const updateMute = () => {
    if (channelRef.current) {
      setIsMuted((prevIsMuted) => !prevIsMuted);
    }
  };

  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.mute = isMuted;
    }
  }, [isMuted]);

  const [isSolo, setIsSolo] = useState(false);

  const updateSolo = () => {
    if (channelRef.current) {
      setIsSolo((prevIsSolo) => !prevIsSolo);
    }
  };

  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.solo = isSolo;
    }
  }, [isSolo]);

  const updateMove = () => {};

  function convertToOpacity(value: number) {
    return parseFloat((value / 100).toFixed(2));
  }

  const { r, g, b } = color;
  const opacity = convertToOpacity(volume);
  const channelColor = `rgba(${r},${g},${b}, ${opacity})`;
  const buttonColor =
    opacity < 0.5 ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.65)';
  const buttonStyle = { color: buttonColor, transition: 'color 0.5s' };

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
          style={buttonStyle}
          icon={<CustomerServiceOutlined />}
          type="link"
          ghost
          title="Solo"
          onClick={updateSolo}
        />
      </div>
      <div className="channel__mute">
        <Button
          style={buttonStyle}
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
          style={{ ...buttonStyle, cursor: 'move' }}
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

export default Channel;
