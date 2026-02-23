import { renderHook } from '@testing-library/react';
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

it('debounces callback within timeout', () => {
  const { result } = renderHook(() =>
    useDebounced(mockCallback, { timeoutMs: 100 }),
  );

  const debouncedCallback = result.current;

  debouncedCallback();
  vi.advanceTimersByTime(50);

  debouncedCallback();
  vi.advanceTimersByTime(50);

  expect(mockCallback).toHaveBeenCalledTimes(0);

  vi.advanceTimersByTime(50);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('updates timeout when timeoutMs changes', () => {
  const { result, rerender } = renderHook(
    ({ timeoutMs }) => useDebounced(mockCallback, { timeoutMs }),
    { initialProps: { timeoutMs: 10 } },
  );

  result.current();
  vi.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  rerender({ timeoutMs: 100 });

  result.current();
  vi.advanceTimersByTime(10);

  expect(mockCallback).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(90);

  expect(mockCallback).toHaveBeenCalledTimes(2);
});

it('has fallback to default timeout option', () => {
  const { result } = renderHook(() => useDebounced(mockCallback));

  result.current();
  vi.advanceTimersByTime(100);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});
