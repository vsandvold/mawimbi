import { renderHook } from '@testing-library/react';
import { App } from 'antd';
import { type ReactNode } from 'react';
import useMessage from '../useMessage';

const mockMessage = {
  error: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
};

vi.spyOn(App, 'useApp').mockReturnValue({
  message: mockMessage,
} as ReturnType<typeof App.useApp>);

const wrapper = ({ children }: { children: ReactNode }) => children;

it('creates a message instance with the given key', () => {
  const { result } = renderHook(() => useMessage(), { wrapper });
  const msg = result.current({ key: 'testKey' });

  msg.success('it works!');

  expect(mockMessage.success).toHaveBeenCalledWith({
    content: 'it works!',
    key: 'testKey',
  });
});

it('supports all message types', () => {
  const { result } = renderHook(() => useMessage(), { wrapper });
  const msg = result.current({ key: 'types' });

  msg.error('error message');
  msg.info('info message');
  msg.loading('loading message');
  msg.success('success message');
  msg.warning('warning message');

  expect(mockMessage.error).toHaveBeenCalledWith({
    content: 'error message',
    key: 'types',
  });
  expect(mockMessage.info).toHaveBeenCalledWith({
    content: 'info message',
    key: 'types',
  });
  expect(mockMessage.loading).toHaveBeenCalledWith({
    content: 'loading message',
    key: 'types',
  });
  expect(mockMessage.success).toHaveBeenCalledWith({
    content: 'success message',
    key: 'types',
  });
  expect(mockMessage.warning).toHaveBeenCalledWith({
    content: 'warning message',
    key: 'types',
  });
});

it('has fallback to default message key', () => {
  const { result } = renderHook(() => useMessage(), { wrapper });
  const msg = result.current();

  msg.success('it works!');

  expect(mockMessage.success).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'it works!',
    }),
  );
});
