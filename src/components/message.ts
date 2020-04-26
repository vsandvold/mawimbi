import { message as antdMessage } from 'antd';

type MessageOptions = {
  key: string;
};

const defaultOptions = {
  key: '',
};

const message = ({ key }: MessageOptions = defaultOptions) => {
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
};

export default message;
