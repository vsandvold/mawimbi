import { App } from 'antd';
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import useMessage from '../message';

const mockSuccess = vi.fn();
const mockError = vi.fn();
const mockInfo = vi.fn();
const mockLoading = vi.fn();
const mockWarning = vi.fn();

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    App: {
      ...actual.App,
      useApp: () => ({
        message: {
          success: mockSuccess,
          error: mockError,
          info: mockInfo,
          loading: mockLoading,
          warning: mockWarning,
        },
      }),
    },
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

it('calls antd message with type, content, and key', () => {
  const { result } = renderHook(() => useMessage());

  result.current({ type: 'success', msg: 'it works!', key: 'messageKey' });

  expect(mockSuccess).toHaveBeenCalledWith({
    content: 'it works!',
    key: 'messageKey',
  });
});

it('supports all message types', () => {
  const { result } = renderHook(() => useMessage());

  result.current({ type: 'error', msg: 'fail' });
  result.current({ type: 'info', msg: 'note' });
  result.current({ type: 'loading', msg: 'wait' });
  result.current({ type: 'warning', msg: 'warn' });

  expect(mockError).toHaveBeenCalledWith({ content: 'fail', key: undefined });
  expect(mockInfo).toHaveBeenCalledWith({ content: 'note', key: undefined });
  expect(mockLoading).toHaveBeenCalledWith({ content: 'wait', key: undefined });
  expect(mockWarning).toHaveBeenCalledWith({
    content: 'warn',
    key: undefined,
  });
});

it('uses instance-based API from App.useApp()', () => {
  const useAppSpy = vi.spyOn(App, 'useApp');

  renderHook(() => useMessage());

  expect(useAppSpy).toHaveBeenCalled();
});
