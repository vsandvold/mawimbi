import { App } from 'antd';
import { useCallback } from 'react';

type MessageOptions = {
  key: string;
};

type MessageApi = {
  error(content: string): void;
  info(content: string): void;
  loading(content: string): void;
  success(content: string): void;
  warning(content: string): void;
};

const defaultOptions = {
  key: '',
};

const useMessage = () => {
  const { message: antdMessage } = App.useApp();

  return useCallback(
    ({ key }: MessageOptions = defaultOptions): MessageApi => {
      return {
        error(content: string) {
          antdMessage.error({ content, key });
        },
        info(content: string) {
          antdMessage.info({ content, key });
        },
        loading(content: string) {
          antdMessage.loading({ content, key });
        },
        success(content: string) {
          antdMessage.success({ content, key });
        },
        warning(content: string) {
          antdMessage.warning({ content, key });
        },
      };
    },
    [antdMessage],
  );
};

export default useMessage;
