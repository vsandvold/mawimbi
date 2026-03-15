import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import Toolbar from '../Toolbar';

const mockToggleMixer = vi.fn();
const mockToggleLyrics = vi.fn();
const mockUploadFile = vi.fn();
const mockToggleFullscreen = vi.fn();
const mockToggleLogOverlay = vi.fn();

const defaultProps = {
  isMixerOpen: false,
  isLyricsOpen: false,
  isEmpty: false,
  onToggleMixer: mockToggleMixer,
  onToggleLyrics: mockToggleLyrics,
  uploadFile: mockUploadFile,
  isFullscreen: false,
  toggleFullscreen: mockToggleFullscreen,
  isLogOverlayOpen: false,
  toggleLogOverlay: mockToggleLogOverlay,
};

it('renders lyrics, mixer, upload, and overflow buttons', () => {
  const { getByTitle, getByLabelText } = render(<Toolbar {...defaultProps} />);

  expect(getByTitle('Show lyrics')).toBeInTheDocument();
  expect(getByTitle('Show mixer')).toBeInTheDocument();
  expect(getByTitle('Upload files')).toBeInTheDocument();
  expect(getByLabelText('More')).toBeInTheDocument();
});

it('disables lyrics and mixer when tracks are empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: true }} />,
  );

  expect(getByTitle('Show lyrics')).toBeDisabled();
  expect(getByTitle('Show mixer')).toBeDisabled();
});

it('enables lyrics and mixer when tracks are not empty', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isEmpty: false }} />,
  );

  expect(getByTitle('Show lyrics')).toBeEnabled();
  expect(getByTitle('Show mixer')).toBeEnabled();
});

it('applies animation class to mixer icon when mixer is open', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: true }} />,
  );

  const mixerButton = getByTitle('Hide mixer');

  expect(mixerButton.querySelector('.show-mixer')).toBeInTheDocument();
});

it('toggles mixer when mixer show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isMixerOpen: false }} />,
  );

  const mixerButton = getByTitle('Show mixer');
  fireEvent.click(mixerButton);

  expect(mockToggleMixer).toHaveBeenCalledTimes(1);
});

it('applies active class to lyrics icon when lyrics is open', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isLyricsOpen: true }} />,
  );

  const textButton = getByTitle('Hide lyrics');

  expect(textButton.querySelector('.show-lyrics')).toBeInTheDocument();
});

it('toggles lyrics when lyrics show/hide is clicked', () => {
  const { getByTitle } = render(
    <Toolbar {...{ ...defaultProps, isLyricsOpen: false }} />,
  );

  const textButton = getByTitle('Show lyrics');
  fireEvent.click(textButton);

  expect(mockToggleLyrics).toHaveBeenCalledTimes(1);
});
