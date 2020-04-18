import { useEffect } from 'react';

type KeypressOptions = {
  targetKey: string;
};

const useKeypress = (
  keypressCallback: Function,
  { targetKey = ' ' }: KeypressOptions
) => {
  useEffect(() => {
    const handleKeyUp = ({ key }: KeyboardEvent) => {
      if (key === targetKey) {
        keypressCallback();
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [keypressCallback, targetKey]);
};

export default useKeypress;
