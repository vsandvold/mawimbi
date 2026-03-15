import { useEffect } from 'react';

type KeypressOptions = {
  targetKey: string;
};

const defaultOptions: KeypressOptions = {
  targetKey: ' ',
};

const useKeypress = (callback: () => void, { targetKey } = defaultOptions) => {
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === targetKey) {
        e.stopPropagation();
        e.preventDefault();
        callback();
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [callback, targetKey]);
};

export default useKeypress;
