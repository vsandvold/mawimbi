import { useCallback } from 'react';
import { toast } from 'sonner';

type MessageType = 'error' | 'info' | 'loading' | 'success' | 'warning';

type MessageOptions = {
  type: MessageType;
  key?: string;
};

const useMessage = () => {
  return useCallback((msg: string, { type, key }: MessageOptions) => {
    const id = key;
    toast[type](msg, { id });
  }, []);
};

export default useMessage;
