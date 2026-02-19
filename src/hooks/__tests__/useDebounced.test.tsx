import { renderHook } from '@testing-library/react-hooks';
import useDebounced from '../useDebounced';

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

it('debounces callback within timeout', () => {
  const { result } = renderHook(() =>
    useDebounced(mockCallback, { ...defaultOptions, timeoutMs: 100 }),
  );

  const debouncedCallback = result.current;

  debouncedCallback();
  vi.advanceTimersByTime(50);

  debouncedCallback();
  vi.advanceTimersByTime(50);

  debouncedCallback();
  vi.advanceTimersByTime(50);

  debouncedCallback();
  vi.advanceTimersByTime(50);

  expect(mockCallback).toHaveBeenCalledTimes(0);

  vi.advanceTimersByTime(50);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('updates callback when dependencies change', () => {
  const { result, rerender } = renderHook(
    ({ options }) => useDebounced(mockCallback, options),
    { initialProps: { options: { ...defaultOptions, timeoutMs: 10 } } },
  );

  let debouncedCallback = result.current;

  debouncedCallback();
  vi.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  rerender({ options: { ...defaultOptions, timeoutMs: 100 } });

  debouncedCallback = result.current;

  debouncedCallback();
  vi.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(90);

  expect(mockCallback).toHaveBeenCalledTimes(2);
});

it('has fallback to default timeout option', () => {
  const { result } = renderHook(() => useDebounced(mockCallback));

  const debouncedCallback = result.current;

  expect(mockCallback).toHaveBeenCalledTimes(0);

  debouncedCallback();
  vi.advanceTimersByTime(100);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});
