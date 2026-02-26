import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useAnimationFrame } from '../useAnimationFrame';

it('schedules a requestAnimationFrame on mount', () => {
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);

  renderHook(() => useAnimationFrame(vi.fn()));

  expect(rafSpy).toHaveBeenCalledTimes(1);
  rafSpy.mockRestore();
});

it('cancels animation frame on unmount', () => {
  const rafId = 42;
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(rafId);
  const cafSpy = vi.spyOn(window, 'cancelAnimationFrame');

  const { unmount } = renderHook(() => useAnimationFrame(vi.fn()));
  unmount();

  expect(cafSpy).toHaveBeenCalledWith(rafId);
  vi.restoreAllMocks();
});

it('calls the callback on each animation frame', () => {
  let latestRafCallback: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    latestRafCallback = cb;
    return 1;
  });
  const callback = vi.fn();

  renderHook(() => useAnimationFrame(callback));
  latestRafCallback?.(0);

  expect(callback).toHaveBeenCalledTimes(1);
  vi.restoreAllMocks();
});

it('uses the latest callback after re-render', () => {
  let latestRafCallback: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    latestRafCallback = cb;
    return 1;
  });
  const callback1 = vi.fn();
  const callback2 = vi.fn();

  const { rerender } = renderHook(({ cb }) => useAnimationFrame(cb), {
    initialProps: { cb: callback1 },
  });

  // First frame calls callback1
  latestRafCallback?.(0);
  expect(callback1).toHaveBeenCalledTimes(1);

  // Re-render with a new callback
  rerender({ cb: callback2 });

  // Next frame calls callback2
  latestRafCallback?.(16);
  expect(callback2).toHaveBeenCalledTimes(1);

  vi.restoreAllMocks();
});

it('schedules the next frame after each callback', () => {
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);

  renderHook(() => useAnimationFrame(vi.fn()));
  expect(rafSpy).toHaveBeenCalledTimes(1);

  // Manually trigger the RAF callback to simulate a frame
  const loopFn = rafSpy.mock.calls[0][0];
  loopFn(0);

  // After executing, it should schedule the next frame
  expect(rafSpy).toHaveBeenCalledTimes(2);
  vi.restoreAllMocks();
});
