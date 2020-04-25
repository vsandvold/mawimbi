import { useEffect } from 'react';

type KeypressOptions = {
  targetKey: string;
};

const defaultOptions: KeypressOptions = {
  targetKey: ' ',
};

const useKeypress = (callback: () => void, { targetKey } = defaultOptions) => {
  useEffect(() => {
    const handleKeyUp = ({ key }: KeyboardEvent) => {
      if (key === targetKey) {
        callback();
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [callback, targetKey]);
};

export default useKeypress;
