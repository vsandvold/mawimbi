import { App } from 'antd';
import { useCallback } from 'react';

type MessageType = 'error' | 'info' | 'loading' | 'success' | 'warning';

type MessageOptions = {
  type: MessageType;
  msg: string;
  key?: string;
};

const useMessage = () => {
  const { message: antdMessage } = App.useApp();

  return useCallback(
    ({ type, msg, key }: MessageOptions) => {
      antdMessage[type]({ content: msg, key });
    },
    [antdMessage],
  );
};

export default useMessage;
