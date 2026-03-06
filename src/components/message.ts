import { App } from 'antd';
import { useCallback } from 'react';

type MessageType = 'error' | 'info' | 'loading' | 'success' | 'warning';

type MessageOptions = {
  type: MessageType;
  key?: string;
};

const useMessage = () => {
  const { message: antdMessage } = App.useApp();

  return useCallback(
    (msg: string, { type, key }: MessageOptions) => {
      antdMessage[type]({ content: msg, key });
    },
    [antdMessage],
  );
};

export default useMessage;
