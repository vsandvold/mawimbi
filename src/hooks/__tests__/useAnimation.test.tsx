import { renderHook } from '@testing-library/react-hooks';
import useAnimation from '../useAnimation';

beforeAll(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

const FRAME_TIME = 1;
const REQUEST_ID = 123;

vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
  setTimeout(callback, FRAME_TIME);
  return REQUEST_ID;
});

vi.spyOn(window, 'cancelAnimationFrame');

const mockCallback = vi.fn();

const defaultOptions = {
  frameRate: 60,
  isActive: true,
};

it('requests animation frame when mounted', () => {
  expect(requestAnimationFrame).not.toHaveBeenCalled();

  renderHook(() => useAnimation(mockCallback, defaultOptions));

  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
});

it('cancels animation frame request when unmounted', () => {
  expect(cancelAnimationFrame).not.toHaveBeenCalled();

  const { unmount } = renderHook(() =>
    useAnimation(mockCallback, defaultOptions),
  );

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(0);

  unmount();

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
  expect(cancelAnimationFrame).toHaveBeenCalledWith(REQUEST_ID);
});

it('triggers effect when dependencies change, and not on every render', () => {
  const { rerender } = renderHook(
    ({ options }) => useAnimation(mockCallback, options),
    { initialProps: { options: defaultOptions } },
  );

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(0);

  rerender({ options: defaultOptions });

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(0);

  rerender({ options: { ...defaultOptions, frameRate: 0 } });

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);

  rerender({ options: { ...defaultOptions, isActive: false } });

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(2);
});

it('does not run animation when deactivated', () => {
  renderHook(() =>
    useAnimation(mockCallback, { ...defaultOptions, isActive: false }),
  );

  expect(requestAnimationFrame).toHaveBeenCalledTimes(0);

  vi.advanceTimersByTime(FRAME_TIME);

  expect(requestAnimationFrame).toHaveBeenCalledTimes(0);
});

it('throttles requests with given frame rate', () => {
  renderHook(() =>
    useAnimation(mockCallback, { ...defaultOptions, frameRate: 1 }),
  );

  expect(mockCallback).toHaveBeenCalledTimes(0);

  vi.advanceTimersByTime(FRAME_TIME);

  expect(mockCallback).toHaveBeenCalledTimes(0);

  vi.advanceTimersByTime(FRAME_TIME * 60);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('has fallback to default frameRate option', () => {
  renderHook(() =>
    useAnimation(mockCallback, { isActive: defaultOptions.isActive }),
  );

  vi.advanceTimersByTime(1);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('has fallback to default isActive option', () => {
  renderHook(() =>
    useAnimation(mockCallback, { frameRate: defaultOptions.frameRate }),
  );

  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
});
