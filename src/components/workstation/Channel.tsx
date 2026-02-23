import {
  CustomerServiceOutlined,
  MenuOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Slider } from 'antd';
import classNames from 'classnames';
import { Track } from '../project/projectPageReducer';
import './Channel.css';
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
    updateMute,
    updateSolo,
  } = useChannelControls(trackId);

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
      <div className="channel__volume" onPointerDown={startFocus}>
        <Slider
          className="channel-slider"
          defaultValue={volume}
          min={0}
          max={100}
          onChange={updateVolume}
          onChangeComplete={commitVolume}
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
  return parseFloat((value / PERCENT_DIVISOR).toFixed(2));
}

export default Channel;
