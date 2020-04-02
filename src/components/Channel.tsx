import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import { SliderValue } from 'antd/lib/slider';
import React, { useEffect, useRef, useState } from 'react';
import AudioService from '../services/AudioService';
import './Channel.css';

type ChannelProps = {
  audioBuffer: AudioBuffer;
};

const Channel = ({ audioBuffer }: ChannelProps) => {
  const channelRef = useRef<Tone.Channel>();

  useEffect(() => {
    channelRef.current = AudioService.createChannel(audioBuffer);
    return () => {
      if (channelRef.current) {
        channelRef.current.dispose();
      }
    };
  }, []);

  const [volume, setVolume] = useState(100);

  const updateVolume = (value: SliderValue) => {
    if (channelRef.current) {
      const volume = value as number;
      channelRef.current.volume.value = convertToDecibel(volume);
      setVolume(volume);
    }
  };

  useEffect(() => {});

  function convertToDecibel(value: number) {
    return 20 * Math.log((value + 1) / 101);
  }

  const [isMuted, setIsMuted] = useState(false);

  const updateMute = () => {
    if (channelRef.current) {
      setIsMuted(prevIsMuted => !prevIsMuted);
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
      setIsSolo(prevIsSolo => !prevIsSolo);
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

  console.log('Channel render');

  return (
    <div
      className="channel"
      style={{
        backgroundColor: `rgba(255, 255, 0, ${convertToOpacity(volume)})`
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
        <Slider defaultValue={75} min={0} max={100} onChange={updateVolume} />
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
