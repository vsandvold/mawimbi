import { renderHook } from '@testing-library/react-hooks';
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

const defaultOptions = {
  timeoutMs: 100,
};

const defaultValue = 1.0;

it('throttles callback with given timeout', () => {
  const { result } = renderHook(() =>
    useThrottled(mockCallback, defaultOptions),
  );

  const throttledCallback = result.current;

  expect(mockCallback).toHaveBeenCalledTimes(0);

  throttledCallback(defaultValue);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(50);
  throttledCallback(defaultValue);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(50);
  throttledCallback(defaultValue);

  expect(mockCallback).toHaveBeenCalledTimes(2);
});

it('passes value onto callback', () => {
  const { result } = renderHook(() =>
    useThrottled(mockCallback, defaultOptions),
  );

  const throttledCallback = result.current;

  throttledCallback(defaultValue);

  expect(mockCallback).toHaveBeenCalledWith(defaultValue);
});

it('updates callback when dependencies change', () => {
  const { result, rerender } = renderHook(
    ({ options }) => useThrottled(mockCallback, options),
    { initialProps: { options: { ...defaultOptions, timeoutMs: 10 } } },
  );
  let throttledCallback = result.current;

  throttledCallback(defaultValue);
  vi.advanceTimersByTime(10);
  throttledCallback(defaultValue);
  vi.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(2);

  rerender({ options: { ...defaultOptions, timeoutMs: 100 } });
  throttledCallback = result.current;

  throttledCallback(defaultValue);
  vi.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(3);

  throttledCallback(defaultValue);
  vi.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(3);

  vi.advanceTimersByTime(80);
  throttledCallback(defaultValue);

  expect(mockCallback).toHaveBeenCalledTimes(4);
});

it('has fallback to default timeout option', () => {
  const { result } = renderHook(() => useThrottled(mockCallback));

  const throttledCallback = result.current;

  expect(mockCallback).toHaveBeenCalledTimes(0);

  throttledCallback(defaultValue);
  vi.advanceTimersByTime(100);
  throttledCallback(defaultValue);

  expect(mockCallback).toHaveBeenCalledTimes(2);
});
