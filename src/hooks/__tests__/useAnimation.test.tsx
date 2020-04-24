import { renderHook } from '@testing-library/react-hooks';
import useAnimation from '../useAnimation';

beforeAll(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

const FRAME_TIME = 1;
const REQUEST_ID = 123;

jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
  setTimeout(callback, FRAME_TIME);
  return REQUEST_ID;
});

jest.spyOn(window, 'cancelAnimationFrame');

const mockCallback = jest.fn();

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
    useAnimation(mockCallback, defaultOptions)
  );

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(0);

  unmount();

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
  expect(cancelAnimationFrame).toHaveBeenCalledWith(REQUEST_ID);
});

// TODO: improve test by passing options as positional arguments

it('has fallback to default frameRate and isActive options', () => {
  renderHook(() => useAnimation(mockCallback));

  // isActive
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

  // frameRate
  jest.advanceTimersByTime(FRAME_TIME);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('does not run animation when deactivated', () => {
  renderHook(() =>
    useAnimation(mockCallback, { ...defaultOptions, isActive: false })
  );

  expect(requestAnimationFrame).toHaveBeenCalledTimes(0);

  jest.advanceTimersByTime(FRAME_TIME);

  expect(requestAnimationFrame).toHaveBeenCalledTimes(0);
});

it('triggers effect when dependencies change, and not on every render', () => {
  const { rerender } = renderHook(
    ({ defaultOptions }) => useAnimation(mockCallback, defaultOptions),
    { initialProps: { defaultOptions } }
  );

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(0);

  rerender({ defaultOptions });

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(0);

  rerender({ defaultOptions: { ...defaultOptions, frameRate: 0 } });

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);

  rerender({ defaultOptions: { ...defaultOptions, isActive: false } });

  expect(cancelAnimationFrame).toHaveBeenCalledTimes(2);
});

it('throttles requests with given frame rate', () => {
  renderHook(() =>
    useAnimation(mockCallback, { ...defaultOptions, frameRate: 1 })
  );

  expect(mockCallback).toHaveBeenCalledTimes(0);

  jest.advanceTimersByTime(FRAME_TIME);

  expect(mockCallback).toHaveBeenCalledTimes(0);

  jest.advanceTimersByTime(FRAME_TIME * 60);

  expect(mockCallback).toHaveBeenCalledTimes(1);
});
