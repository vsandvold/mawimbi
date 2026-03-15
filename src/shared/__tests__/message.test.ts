import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { vi } from 'vitest';
import useMessage from '../message';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    warning: vi.fn(),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
});

it('calls sonner toast with type, message, and id', () => {
  const { result } = renderHook(() => useMessage());

  result.current('it works!', { type: 'success', key: 'messageKey' });

  expect(toast.success).toHaveBeenCalledWith('it works!', {
    id: 'messageKey',
  });
});

it('supports all message types', () => {
  const { result } = renderHook(() => useMessage());

  result.current('fail', { type: 'error' });
  result.current('note', { type: 'info' });
  result.current('wait', { type: 'loading' });
  result.current('warn', { type: 'warning' });

  expect(toast.error).toHaveBeenCalledWith('fail', { id: undefined });
  expect(toast.info).toHaveBeenCalledWith('note', { id: undefined });
  expect(toast.loading).toHaveBeenCalledWith('wait', { id: undefined });
  expect(toast.warning).toHaveBeenCalledWith('warn', { id: undefined });
});

it('returns a stable callback reference', () => {
  const { result, rerender } = renderHook(() => useMessage());
  const first = result.current;
  rerender();
  expect(result.current).toBe(first);
});
