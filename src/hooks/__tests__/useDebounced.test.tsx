import { renderHook } from '@testing-library/react-hooks';
import useDebounced from '../useDebounced';

beforeAll(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

const mockCallback = jest.fn();

const defaultOptions = {
  timeoutMs: 100,
};

it('debounces callback within timeout', () => {
  const { result } = renderHook(() =>
    useDebounced(mockCallback, { ...defaultOptions, timeoutMs: 100 })
  );

  const debouncedCallback = result.current;

  debouncedCallback();
  jest.advanceTimersByTime(50);

  debouncedCallback();
  jest.advanceTimersByTime(50);

  debouncedCallback();
  jest.advanceTimersByTime(50);

  debouncedCallback();
  jest.advanceTimersByTime(50);

  expect(mockCallback).toHaveBeenCalledTimes(0);

  jest.advanceTimersByTime(50);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('updates callback when dependencies change', () => {
  const { result, rerender } = renderHook(
    ({ options }) => useDebounced(mockCallback, options),
    { initialProps: { options: { ...defaultOptions, timeoutMs: 10 } } }
  );

  let debouncedCallback = result.current;

  debouncedCallback();
  jest.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  rerender({ options: { ...defaultOptions, timeoutMs: 100 } });

  debouncedCallback = result.current;

  debouncedCallback();
  jest.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  jest.advanceTimersByTime(90);

  expect(mockCallback).toHaveBeenCalledTimes(2);
});

it('has fallback to default timeout option', () => {
  const { result } = renderHook(() => useDebounced(mockCallback));

  const debouncedCallback = result.current;

  expect(mockCallback).toHaveBeenCalledTimes(0);

  debouncedCallback();
  jest.advanceTimersByTime(100);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});
