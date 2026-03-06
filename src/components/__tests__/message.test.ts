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

it('renders message with given content and key', () => {
  const { result } = renderHook(() => useMessage());
  const msg = result.current({ key: 'messageKey' });

  msg.success('it works!');

  expect(mockSuccess).toHaveBeenCalledWith({
    content: 'it works!',
    key: 'messageKey',
  });
});

it('has fallback to default message key', () => {
  const { result } = renderHook(() => useMessage());
  const msg = result.current();

  msg.success('it works!');

  expect(mockSuccess).toHaveBeenCalledWith(
    expect.objectContaining({
      content: 'it works!',
    }),
  );
});

it('uses instance-based API from App.useApp()', () => {
  // Verify the hook calls App.useApp() — the instance-based API renders
  // messages inside the AntApp context where theme and styles apply.
  const useAppSpy = vi.spyOn(App, 'useApp');

  renderHook(() => useMessage());

  expect(useAppSpy).toHaveBeenCalled();
});
