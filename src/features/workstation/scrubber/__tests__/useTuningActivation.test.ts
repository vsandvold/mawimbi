import { renderHook } from '@testing-library/react';
import { useTuningAvailable } from '../useTuningActivation';

afterEach(() => {
  vi.unstubAllEnvs();
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
