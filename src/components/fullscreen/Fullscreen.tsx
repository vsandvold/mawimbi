import { FullscreenOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import React, { useState } from 'react';
import { FullScreen, FullScreenHandle } from 'react-full-screen';
import './Fullscreen.css';
import { useBrowserSupport } from '../../browserSupport';

export { useFullScreenHandle } from 'react-full-screen';
export type { FullScreenHandle } from 'react-full-screen';

type FullscreenProps = React.PropsWithChildren<{
  handle: FullScreenHandle;
}>;

const Fullscreen = (props: FullscreenProps) => {
  const { handle } = props;

  const browserSupport = useBrowserSupport();
  const [isFullscreen, setFullscreen] = useState(false);
  const [isFullscreenDismissed, setFullscreenDismissed] = useState(false);

  const showOverlay =
    !isFullscreen && !isFullscreenDismissed && browserSupport.touchEvents;

  const activateFullscreen = () => {
    handle.enter();
    setFullscreen(true);
    setFullscreenDismissed(true);
  };

  const dismissFullscreen = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setFullscreenDismissed(true);
  };

  const onFullscreenChanged = (state: boolean) => {
    setFullscreen(state);
  };

  const { Title, Text } = Typography;

  return (
    <FullScreen handle={handle} onChange={onFullscreenChanged}>
      {props.children}
      {showOverlay && (
        <div className="fullscreen__overlay">
          <div className="overlay-content" onClick={activateFullscreen}>
            <Text>
              <FullscreenOutlined className="fullscreen-icon" />
            </Text>
            <Title level={4}>Tap to enter full screen</Title>
            <Button type="link" className="button" onClick={dismissFullscreen}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </FullScreen>
  );
};

export default Fullscreen;
