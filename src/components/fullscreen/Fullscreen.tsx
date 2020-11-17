import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import React from 'react';
import { FullScreen, FullScreenHandle } from 'react-full-screen';
import './Fullscreen.css';

export { useFullScreenHandle } from 'react-full-screen';

type FullscreenProps = React.PropsWithChildren<{
  handle: FullScreenHandle;
}>;

const Fullscreen = (props: FullscreenProps) => {
  const { handle } = props;

  return (
    <FullScreen handle={handle}>
      {props.children}
      <div className="fullscreen__button">
        <Button
          type="link"
          size="large"
          className="button"
          icon={
            handle.active ? <FullscreenExitOutlined /> : <FullscreenOutlined />
          }
          title={handle.active ? 'Exit Full Screen' : 'Enter Full Screen'}
          onClick={handle.active ? handle.exit : handle.enter}
        />
      </div>
    </FullScreen>
  );
};

export default Fullscreen;
