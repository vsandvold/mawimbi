import { App } from 'antd';
import { useCallback } from 'react';

type MessageOptions = {
  key: string;
};

const defaultOptions: MessageOptions = {
  key: '',
};

type MessageInstance = {
  error: (content: string) => void;
  info: (content: string) => void;
  loading: (content: string) => void;
  success: (content: string) => void;
  warning: (content: string) => void;
};

const useMessage = () => {
  const { message: antdMessage } = App.useApp();

  const createMessage = useCallback(
    ({ key }: MessageOptions = defaultOptions): MessageInstance => ({
      error: (content: string) => antdMessage.error({ content, key }),
      info: (content: string) => antdMessage.info({ content, key }),
      loading: (content: string) => antdMessage.loading({ content, key }),
      success: (content: string) => antdMessage.success({ content, key }),
      warning: (content: string) => antdMessage.warning({ content, key }),
    }),
    [antdMessage],
  );

  return createMessage;
};

export default useMessage;
