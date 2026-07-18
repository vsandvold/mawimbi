import { act, renderHook } from '@testing-library/react';
import { useLongPress, useTuningAvailable } from '../useTuningActivation';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('useTuningAvailable', () => {
  it('is available in dev builds', () => {
    vi.stubEnv('DEV', true);

    const { result } = renderHook(() => useTuningAvailable());

    expect(result.current).toBe(true);
  });

  it('is unavailable in non-dev builds without the ?tune query param', () => {
    vi.stubEnv('DEV', false);

    const { result } = renderHook(() => useTuningAvailable());

    expect(result.current).toBe(false);
  });

  it('is available in non-dev builds with the ?tune query param', () => {
    vi.stubEnv('DEV', false);
    const originalLocation = window.location.href;
    window.history.pushState({}, '', '/project/test-id?tune');

    const { result } = renderHook(() => useTuningAvailable());

    expect(result.current).toBe(true);

    window.history.pushState({}, '', originalLocation);
  });
});

describe('useLongPress', () => {
  it('fires onLongPress after a sustained pointer-down', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown());
    act(() => vi.advanceTimersByTime(700));

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire before the delay elapses', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown());
    act(() => vi.advanceTimersByTime(200));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels on pointer-up before the delay elapses', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.onPointerUp());
    act(() => vi.advanceTimersByTime(700));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels on pointer-leave before the delay elapses', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress(onLongPress));

    act(() => result.current.onPointerDown());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.onPointerLeave());
    act(() => vi.advanceTimersByTime(700));

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
