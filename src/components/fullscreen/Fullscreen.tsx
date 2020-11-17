import { FullscreenOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import React from 'react';
import { FullScreen, FullScreenHandle } from 'react-full-screen';
import './Fullscreen.css';

export { useFullScreenHandle } from 'react-full-screen';
export type { FullScreenHandle } from 'react-full-screen';

type FullscreenProps = React.PropsWithChildren<{
  handle: FullScreenHandle;
  showOverlay: boolean;
  onActivate: (state: boolean) => void;
  onDismiss: () => void;
}>;

const Fullscreen = (props: FullscreenProps) => {
  const { handle, onActivate, onDismiss, showOverlay } = props;

  const activateFullscreen = () => {
    const isActivated = !handle.active;
    if (isActivated) {
      handle.enter();
    } else {
      handle.exit();
    }
    onActivate(isActivated);
  };

  const dismissFullscreen = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  };

  const { Title, Text } = Typography;

  return (
    <FullScreen handle={handle}>
      {props.children}
      {showOverlay && (
        <div className="fullscreen__overlay">
          <div className="overlay-content" onClick={activateFullscreen}>
            <Text>
              <FullscreenOutlined className="fullscreen-icon" />
            </Text>
            <Title level={4}>Tap to enter full screen</Title>
            <Button onClick={dismissFullscreen}>Dismiss</Button>
          </div>
        </div>
      )}
    </FullScreen>
  );
};

export default Fullscreen;
