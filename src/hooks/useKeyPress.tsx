import { useEffect } from 'react';

type KeyPressOptions = {
  targetKey: string;
};

const useKeyPress = (
  keyPressCallback: Function,
  { targetKey = ' ' }: KeyPressOptions
) => {
  const handleKeyUp = ({ key }: KeyboardEvent) => {
    if (key === targetKey) {
      keyPressCallback();
    }
  };

  useEffect(() => {
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, []); // Make sure the effect runs only once
};

export default useKeyPress;
