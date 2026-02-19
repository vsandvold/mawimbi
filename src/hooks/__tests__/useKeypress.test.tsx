import { fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import useKeypress from '../useKeypress';

vi.spyOn(window, 'addEventListener');
vi.spyOn(window, 'removeEventListener');

const mockCallback = vi.fn();

const defaultOptions = {
  targetKey: ' ',
};

it('adds eventlistener to window element when mounted', () => {
  renderHook(() => useKeypress(mockCallback, defaultOptions));

  expect(vi.mocked(addEventListener).mock.calls).toEqual(
    expect.arrayContaining([expect.arrayContaining(['keyup'])]),
  );
});

it('removes eventlistenere when unmounted', () => {
  const { unmount } = renderHook(() =>
    useKeypress(mockCallback, defaultOptions),
  );

  unmount();

  expect(vi.mocked(removeEventListener).mock.calls).toEqual(
    expect.arrayContaining([expect.arrayContaining(['keyup'])]),
  );
});

it('triggers effect when dependencies change, and not on every render', () => {
  // TODO: not implemented
});

it('triggers callback when target key is pressed', () => {
  renderHook(() =>
    useKeypress(mockCallback, { ...defaultOptions, targetKey: 'Esc' }),
  );

  expect(mockCallback).toHaveBeenCalledTimes(0);

  fireEvent.keyUp(window, { key: 'Esc', code: 'Esc' });

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('does not trigger callback for other key', () => {
  renderHook(() =>
    useKeypress(mockCallback, { ...defaultOptions, targetKey: 'Esc' }),
  );

  expect(mockCallback).toHaveBeenCalledTimes(0);

  fireEvent.keyUp(window, { key: 'Enter', code: 'Enter' });

  expect(mockCallback).toHaveBeenCalledTimes(0);
});

it('has fallback to default target key', () => {
  renderHook(() => useKeypress(mockCallback, defaultOptions));

  expect(mockCallback).toHaveBeenCalledTimes(0);

  fireEvent.keyUp(window, { key: ' ', code: 'Space' });

  expect(mockCallback).toHaveBeenCalledTimes(1);
});
