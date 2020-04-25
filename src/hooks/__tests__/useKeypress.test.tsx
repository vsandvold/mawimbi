import { fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import useKeypress from '../useKeypress';

jest.spyOn(window, 'addEventListener');
jest.spyOn(window, 'removeEventListener');

const mockCallback = jest.fn();

const defaultOptions = {
  targetKey: ' ',
};

it('adds eventlistener to window element when mounted', () => {
  renderHook(() => useKeypress(mockCallback, defaultOptions));

  expect((addEventListener as jest.Mock<any, any>).mock.calls).toEqual(
    expect.arrayContaining([expect.arrayContaining(['keyup'])])
  );
});

it('removes eventlistenere when unmounted', () => {
  const { unmount } = renderHook(() =>
    useKeypress(mockCallback, defaultOptions)
  );

  unmount();

  expect((removeEventListener as jest.Mock<any, any>).mock.calls).toEqual(
    expect.arrayContaining([expect.arrayContaining(['keyup'])])
  );
});

it('triggers callback when target key is pressed', () => {
  renderHook(() =>
    useKeypress(mockCallback, { ...defaultOptions, targetKey: 'Esc' })
  );

  expect(mockCallback).toHaveBeenCalledTimes(0);

  fireEvent.keyUp(window, { key: 'Esc', code: 'Esc' });

  expect(mockCallback).toHaveBeenCalledTimes(1);
});

it('does not trigger callback for other key', () => {
  renderHook(() =>
    useKeypress(mockCallback, { ...defaultOptions, targetKey: 'Esc' })
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
