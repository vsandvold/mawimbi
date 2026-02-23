import { renderHook } from '@testing-library/react';
import useThrottled from '../useThrottled';

beforeAll(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

const mockCallback = vi.fn();

it('fires immediately on first call', () => {
  const { result } = renderHook(() =>
    useThrottled(mockCallback, { timeoutMs: 100 }),
  );

  result.current();

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('throttles subsequent calls within timeout', () => {
  const { result } = renderHook(() =>
    useThrottled(mockCallback, { timeoutMs: 100 }),
  );

  result.current();
  result.current();
  result.current();

  expect(mockCallback).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(100);

  result.current();

  expect(mockCallback).toHaveBeenCalledTimes(2);
});

it('has fallback to default timeout option', () => {
  const { result } = renderHook(() => useThrottled(mockCallback));

  result.current();

  expect(mockCallback).toHaveBeenCalledTimes(1);

  result.current();
  vi.advanceTimersByTime(100);

  result.current();

  expect(mockCallback).toHaveBeenCalledTimes(2);
});
