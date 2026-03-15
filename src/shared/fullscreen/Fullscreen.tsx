import { Maximize } from 'lucide-react';
import { Button } from '../ui/button';
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

  return (
    <FullScreen handle={handle} onChange={onFullscreenChanged}>
      {props.children}
      {showOverlay && (
        <div className="fullscreen__overlay">
          <div className="overlay-content" onClick={activateFullscreen}>
            <span>
              <Maximize className="fullscreen-icon" />
            </span>
            <h4 className="text-xl font-semibold">Tap to enter full screen</h4>
            <Button
              variant="ghost"
              className="button"
              onClick={dismissFullscreen}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </FullScreen>
  );
};

export default Fullscreen;
