import { render } from '@testing-library/react';
import { type ReactNode } from 'react';
import { vi } from 'vitest';
import { useFileDropzone } from '../../../shared/dropzone/useFileDropzone';
import { mockTrack } from '../../../testUtils';
import Workstation from '../Workstation';
import {
  useClassificationSync,
  useCountIn,
  useSpacebarPlaybackToggle,
  useTotalTime,
} from '../workstationEffects';

vi.mock('../EmptyTimeline', () => ({
  default: () => <div data-testid="empty-timeline"></div>,
}));
vi.mock('../Mixer');
vi.mock('../BottomSheet', () => ({
  default: ({ title }: { title: string }) => (
    <div data-testid="bottom-sheet">{title}</div>
  ),
}));
vi.mock('../scrubber/Scrubber', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="scrubber">{children}</div>
  ),
}));
vi.mock('../Timeline', () => ({
  default: () => <div data-testid="regular-timeline"></div>,
}));
vi.mock('../ToolbarBottomSheet', () => ({
  default: () => <div data-testid="toolbar-bottom-sheet"></div>,
}));

vi.mock('../workstationEffects', () => mockWorkstationEffects());

vi.mock('../../../shared/dropzone/useFileDropzone', () => ({
  useFileDropzone: vi.fn(() => ({
    isDragActive: false,
    isDragAccept: false,
    isDragReject: false,
    rootProps: {},
    inputProps: {},
  })),
}));

const defaultProps = {
  recordingColor: { r: 77, g: 238, b: 234 },
  tracks: [],
  uploadFile: vi.fn(),
  isFullscreen: false,
  toggleFullscreen: vi.fn(),
  isLogOverlayOpen: false,
  toggleLogOverlay: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: false,
  canRedo: false,
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

it('renders mixer, effects, and lyrics bottom sheets', () => {
  const { getAllByTestId } = render(<Workstation {...defaultProps} />);

  const sheets = getAllByTestId('bottom-sheet');

  expect(sheets).toHaveLength(3);
  expect(sheets[0]).toHaveTextContent('Mixer');
  expect(sheets[1]).toHaveTextContent('Effects');
  expect(sheets[2]).toHaveTextContent('Lyrics');
});

it('renders dropzone hidden by default', () => {
  const { container } = render(<Workstation {...defaultProps} />);

  const dropzone = container.querySelector('.editor__dropzone');

  expect(dropzone).toHaveClass('editor__dropzone--hidden');
});

it('uses workstation effect hooks', () => {
  render(<Workstation {...defaultProps} />);

  expect(useFileDropzone).toHaveBeenCalled();
  expect(useSpacebarPlaybackToggle).toHaveBeenCalled();
  expect(useClassificationSync).toHaveBeenCalled();
  expect(useTotalTime).toHaveBeenCalled();
  expect(useCountIn).toHaveBeenCalled();
});

function mockWorkstationEffects() {
  return {
    useClassificationSync: vi.fn(),
    useCountIn: vi.fn(() => null),
    useSpacebarPlaybackToggle: vi.fn(),
    useTotalTime: vi.fn(),
    useMicrophone: vi.fn(),
  };
}
