import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import { SliderValue } from 'antd/lib/slider';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { ProjectDispatch, Track, SET_VOLUME } from '../hooks/useProjectState';
import AudioService from '../services/AudioService';
import './Channel.css';

type ChannelProps = {
  track: Track;
};

const Channel = ({ track }: ChannelProps) => {
  console.log('Channel render');

  const dispatch = useContext(ProjectDispatch);

  const channelRef = useRef<Tone.Channel | null>(null);

  useEffect(() => {
    channelRef.current = AudioService.createChannel(track.audioBuffer);
    return () => {
      if (channelRef.current) {
        channelRef.current.dispose();
      }
    };
  }, []);

  const updateVolume = (value: SliderValue) => {
    if (channelRef.current) {
      const volume = value as number;
      channelRef.current.volume.value = convertToDecibel(volume);
      dispatch([SET_VOLUME, { id: track.id, volume }]);
    }
  };

  useEffect(() => {});

  function convertToDecibel(value: number) {
    return 20 * Math.log((value + 1) / 101);
  }

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
    return (value / 100).toFixed(2);
  }

  const { r, g, b } = track.color;
  const opacity = convertToOpacity(track.volume);
  const channelColor = `rgba(${r},${g},${b}, ${opacity})`;

  return (
    <div
      className="channel"
      style={{
        backgroundColor: channelColor,
      }}
    >
      <div className="channel__solo">
        <Button
          icon={<CustomerServiceOutlined />}
          type="link"
          ghost
          title="Solo"
          onClick={updateSolo}
        />
      </div>
      <div className="channel__mute">
        <Button
          icon={<SoundOutlined />}
          type="link"
          ghost
          title="Mute"
          onClick={updateMute}
        />
      </div>
      <div className="channel__volume">
        <Slider
          defaultValue={track.volume}
          min={0}
          max={100}
          onChange={updateVolume}
        />
      </div>
      <div className="channel__move">
        <Button
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
