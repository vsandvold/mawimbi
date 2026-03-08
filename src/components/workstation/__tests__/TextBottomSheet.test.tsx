import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { mockTrack } from '../../../testUtils';
import TextBottomSheet from '../TextBottomSheet';

vi.mock('../BottomSheet', () => ({
  default: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="bottom-sheet" data-title={title}>
      {children}
    </div>
  ),
}));

const defaultProps = {
  isOpen: true,
  onOpenChange: vi.fn(),
  onHeightChange: vi.fn(),
  tracks: [] as ReturnType<typeof mockTrack>[],
};

it('shows empty state when no vocal tracks exist', () => {
  const { getByText } = render(<TextBottomSheet {...defaultProps} />);

  expect(getByText('No vocal tracks detected')).toBeInTheDocument();
});

it('shows empty state when tracks exist but none are vocals', () => {
  const tracks = [
    mockTrack({ trackId: 'track-1', instrument: 'drums' }),
    mockTrack({ trackId: 'track-2', instrument: 'guitar' }),
  ];

  const { getByText } = render(
    <TextBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('No vocal tracks detected')).toBeInTheDocument();
});

it('displays vocal tracks with filename and transcribe button', () => {
  const tracks = [
    mockTrack({
      trackId: 'track-1',
      fileName: 'vocals.wav',
      instrument: 'voice',
    }),
  ];

  const { getByText } = render(
    <TextBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('vocals.wav')).toBeInTheDocument();
  expect(getByText('Transcribe')).toBeInTheDocument();
});

it('renders color indicator for vocal tracks', () => {
  const tracks = [
    mockTrack({
      trackId: 'track-1',
      instrument: 'voice',
      color: { r: 100, g: 200, b: 50 },
    }),
  ];

  const { container } = render(
    <TextBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const colorDot = container.querySelector('.text-bottom-sheet__color');

  expect(colorDot).toHaveStyle({ backgroundColor: 'rgb(100,200,50)' });
});

it('filters out non-vocal tracks', () => {
  const tracks = [
    mockTrack({
      trackId: 'track-1',
      fileName: 'vocals.wav',
      instrument: 'voice',
    }),
    mockTrack({
      trackId: 'track-2',
      fileName: 'drums.wav',
      instrument: 'drums',
    }),
    mockTrack({
      trackId: 'track-3',
      fileName: 'backup.wav',
      instrument: 'voice',
    }),
  ];

  const { getByText, queryByText } = render(
    <TextBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('vocals.wav')).toBeInTheDocument();
  expect(getByText('backup.wav')).toBeInTheDocument();
  expect(queryByText('drums.wav')).not.toBeInTheDocument();
});

it('renders transcribe button as disabled placeholder', () => {
  const tracks = [mockTrack({ trackId: 'track-1', instrument: 'voice' })];

  const { getByText } = render(
    <TextBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('Transcribe')).toBeDisabled();
});

it('passes title "Text" to BottomSheet', () => {
  const { getByTestId } = render(<TextBottomSheet {...defaultProps} />);

  expect(getByTestId('bottom-sheet')).toHaveAttribute('data-title', 'Text');
});
