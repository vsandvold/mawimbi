import { render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { mockTrack } from '../../../testUtils';
import Workstation from '../Workstation';
import {
  useDropzoneDragActive,
  useMixerHeight,
  useMutedTracks,
  usePlaybackControl,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from '../workstationEffects';

vi.mock('../EmptyTimeline', () => ({
  default: () => <div data-testid="empty-timeline"></div>,
}));
vi.mock('../Mixer');
vi.mock('../Scrubber', () => ({
  default: ({ children }: any) => <div data-testid="scrubber">{children}</div>,
}));
vi.mock('../Timeline', () => ({
  default: () => <div data-testid="regular-timeline"></div>,
}));

vi.mock('../workstationEffects', () => mockWorkstationEffects());

const defaultProps = {
  tracks: [],
  uploadFile: vi.fn(),
};

const defaultTrack = mockTrack();

it('renders empty timeline when tracks are empty', () => {
  const { getByTestId } = render(
    <Workstation {...{ ...defaultProps, tracks: [] }} />,
  );

  expect(getByTestId('empty-timeline')).toBeInTheDocument();
});

it('renders regular timeline when tracks are non-empty', () => {
  const { getByTestId } = render(
    <Workstation {...{ ...defaultProps, tracks: [defaultTrack] }} />,
  );

  expect(getByTestId('regular-timeline')).toBeInTheDocument();
});

it('renders closed mixer by default', () => {
  const { container } = render(<Workstation {...defaultProps} />);

  const mixer = container.querySelector('.editor__mixer');

  expect(mixer).toHaveClass('editor__mixer--closed');
});

it('renders dropzone hidden by default', () => {
  const { container } = render(<Workstation {...defaultProps} />);

  const dropzone = container.querySelector('.editor__dropzone');

  expect(dropzone).toHaveClass('editor__dropzone--hidden');
});

it('uses workstation effect hooks', () => {
  render(<Workstation {...defaultProps} />);

  expect(useDropzoneDragActive).toHaveBeenCalled();
  expect(useMixerHeight).toHaveBeenCalled();
  expect(useMutedTracks).toHaveBeenCalled();
  expect(usePlaybackControl).toHaveBeenCalled();
  expect(useSpacebarPlaybackToggle).toHaveBeenCalled();
  expect(useTotalTime).toHaveBeenCalled();
});

function mockWorkstationEffects() {
  return {
    useDropzoneDragActive: vi.fn(() => ({
      isDragActive: false,
      setIsDragActive: vi.fn(),
      dropzoneRootProps: {},
      setDropzoneRootProps: vi.fn(),
    })),
    useMixerHeight: vi.fn(() => ({
      drawerContainerRef: { current: null },
      drawerHeight: 0,
    })),
    useMutedTracks: vi.fn(),
    usePlaybackControl: vi.fn(),
    useSpacebarPlaybackToggle: vi.fn(),
    useTotalTime: vi.fn(),
    useMicrophone: vi.fn(),
  };
}
