import { render } from '@testing-library/react';
import { type ReactNode } from 'react';
import { vi } from 'vitest';
import { useFileDropzone } from '../../dropzone/useFileDropzone';
import { useAudioBridge } from '../../../hooks/useAudioBridge';
import { useTransportBridge } from '../../../hooks/useTransportBridge';
import { mockTrack } from '../../../testUtils';
import Workstation from '../Workstation';
import {
  useMixerHeight,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from '../workstationEffects';

vi.mock('../EmptyTimeline', () => ({
  default: () => <div data-testid="empty-timeline"></div>,
}));
vi.mock('../Mixer');
vi.mock('../Scrubber', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="scrubber">{children}</div>
  ),
}));
vi.mock('../Timeline', () => ({
  default: () => <div data-testid="regular-timeline"></div>,
}));

vi.mock('../../../hooks/useAudioBridge', () => ({
  useAudioBridge: vi.fn(),
}));

vi.mock('../../../hooks/useTransportBridge', () => ({
  useTransportBridge: vi.fn(),
}));

vi.mock('../workstationEffects', () => mockWorkstationEffects());

vi.mock('../../dropzone/useFileDropzone', () => ({
  useFileDropzone: vi.fn(() => ({
    isDragActive: false,
    isDragAccept: false,
    isDragReject: false,
    rootProps: {},
    inputProps: {},
  })),
}));

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

  expect(useAudioBridge).toHaveBeenCalled();
  expect(useTransportBridge).toHaveBeenCalled();
  expect(useFileDropzone).toHaveBeenCalled();
  expect(useMixerHeight).toHaveBeenCalled();
  expect(useSpacebarPlaybackToggle).toHaveBeenCalled();
  expect(useTotalTime).toHaveBeenCalled();
});

function mockWorkstationEffects() {
  return {
    useMixerHeight: vi.fn(() => ({
      mixerContainerRef: { current: null },
      mixerHeight: 0,
    })),
    useSpacebarPlaybackToggle: vi.fn(),
    useTotalTime: vi.fn(),
    useMicrophone: vi.fn(),
  };
}
