import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import { mockTrack } from '../../../testUtils';
import type { TranscriptionState } from '../../../services/TranscriptionService';
import type { ClassificationResult } from '../../../services/InstrumentClassificationService';
import type { Transcription } from '../../../types/transcription';
import type { TrackId } from '../../../types/track';
import LyricsBottomSheet from '../LyricsBottomSheet';

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

const mockRetrieveAudioBuffer = vi.fn();

vi.mock('../../../hooks/useTrackService', () => ({
  useTrackService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
  }),
}));

const mockGetClassification =
  vi.fn<(id: TrackId) => ClassificationResult | undefined>();

vi.mock('../../../hooks/useClassificationService', () => ({
  useClassificationService: () => ({
    getClassification: mockGetClassification,
  }),
}));

const mockTranscribe = vi.fn();
const mockGetTranscriptionState = vi.fn<(id: TrackId) => TranscriptionState>(
  () => 'idle',
);
const mockGetTranscription =
  vi.fn<(id: TrackId) => Transcription | undefined>();
let mockDownloadProgress: number | null = null;

vi.mock('../../../hooks/useTranscriptionService', () => ({
  useTranscriptionService: () => ({
    getTranscriptionState: mockGetTranscriptionState,
    getTranscription: mockGetTranscription,
    get downloadProgress() {
      return mockDownloadProgress;
    },
    transcribe: mockTranscribe,
  }),
}));

const defaultProps = {
  isOpen: true,
  onOpenChange: vi.fn(),
  onHeightChange: vi.fn(),
  tracks: [] as ReturnType<typeof mockTrack>[],
};

beforeEach(() => {
  mockDownloadProgress = null;
  mockGetClassification.mockReturnValue(undefined);
  mockGetTranscriptionState.mockReturnValue('idle');
  mockGetTranscription.mockReturnValue(undefined);
});

it('shows empty state when no vocal tracks exist', () => {
  const { getByText } = render(<LyricsBottomSheet {...defaultProps} />);

  expect(getByText('No vocal tracks detected')).toBeInTheDocument();
});

it('shows empty state when tracks exist but none are vocals', () => {
  mockGetClassification.mockImplementation((id: TrackId) => {
    const map: Record<string, ClassificationResult> = {
      'track-1': { label: 'drums', score: 0.9 },
      'track-2': { label: 'guitar', score: 0.8 },
    };
    return map[id];
  });

  const tracks = [
    mockTrack({ trackId: 'track-1' }),
    mockTrack({ trackId: 'track-2' }),
  ];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('No vocal tracks detected')).toBeInTheDocument();
});

it('displays vocal tracks with filename and transcribe button', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });

  const tracks = [
    mockTrack({
      trackId: 'track-1',
      fileName: 'vocals.wav',
    }),
  ];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('vocals.wav')).toBeInTheDocument();
  expect(getByText('Transcribe')).toBeInTheDocument();
});

it('renders color indicator for vocal tracks', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });

  const tracks = [
    mockTrack({
      trackId: 'track-1',
      color: { r: 100, g: 200, b: 50 },
    }),
  ];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const colorDot = container.querySelector('.lyrics-bottom-sheet__color');

  expect(colorDot).toHaveStyle({ backgroundColor: 'rgb(100,200,50)' });
});

it('filters out non-vocal tracks', () => {
  mockGetClassification.mockImplementation((id: TrackId) => {
    const map: Record<string, ClassificationResult> = {
      'track-1': { label: 'vocals', score: 0.93 },
      'track-2': { label: 'drums', score: 0.9 },
      'track-3': { label: 'vocals', score: 0.87 },
    };
    return map[id];
  });

  const tracks = [
    mockTrack({
      trackId: 'track-1',
      fileName: 'vocals.wav',
    }),
    mockTrack({
      trackId: 'track-2',
      fileName: 'drums.wav',
    }),
    mockTrack({
      trackId: 'track-3',
      fileName: 'backup.wav',
    }),
  ];

  const { getByText, queryByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('vocals.wav')).toBeInTheDocument();
  expect(getByText('backup.wav')).toBeInTheDocument();
  expect(queryByText('drums.wav')).not.toBeInTheDocument();
});

it('passes title "Lyrics" to BottomSheet', () => {
  const { getByTestId } = render(<LyricsBottomSheet {...defaultProps} />);

  expect(getByTestId('bottom-sheet')).toHaveAttribute('data-title', 'Lyrics');
});

// --- Transcribe button click ---

it('calls transcribe with audioBuffer on Transcribe click', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  const fakeBuffer = {} as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(fakeBuffer);

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  fireEvent.click(getByText('Transcribe'));

  expect(mockRetrieveAudioBuffer).toHaveBeenCalledWith('track-1');
  expect(mockTranscribe).toHaveBeenCalledWith('track-1', fakeBuffer);
});

it('does not call transcribe when audioBuffer is unavailable', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockRetrieveAudioBuffer.mockReturnValue(undefined);

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  fireEvent.click(getByText('Transcribe'));

  expect(mockTranscribe).not.toHaveBeenCalled();
});

// --- Transcribing state ---

it('shows spinner when track is transcribing', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('transcribing');

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByLabelText, getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByLabelText('Transcribing')).toBeInTheDocument();
  expect(getByText('Transcribing…')).toBeInTheDocument();
});

it('shows download progress bar during model download', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('transcribing');
  mockDownloadProgress = 42;

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText, getByRole } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('Downloading model… 42%')).toBeInTheDocument();
  expect(getByRole('progressbar')).toBeInTheDocument();
});

// --- Done state ---

it('displays transcription segments when done', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world, this is a test',
        start: 0,
        end: 3,
        words: [],
      },
      {
        text: 'The second line of the song',
        start: 4,
        end: 7,
        words: [],
      },
    ],
  });

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText, queryByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('Hello world, this is a test')).toBeInTheDocument();
  expect(getByText('The second line of the song')).toBeInTheDocument();
  // Transcribe button should be hidden when done
  expect(queryByText('Transcribe')).not.toBeInTheDocument();
});

it('splits segment into phrases based on word timing gaps', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world goodbye world',
        start: 0,
        end: 5,
        words: [
          { text: 'Hello', start: 0, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
          // 0.5s gap — triggers phrase break (>= 0.3s)
          { text: 'goodbye', start: 1.2, end: 1.6 },
          { text: 'world', start: 1.65, end: 2.0 },
        ],
      },
    ],
  });

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('Hello world')).toBeInTheDocument();
  expect(getByText('goodbye world')).toBeInTheDocument();
});

it('shows no-speech message when transcription has zero segments', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [],
  });

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(getByText('No speech detected')).toBeInTheDocument();
});

// --- Error state ---

it('shows error message and retry button on failure', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('error');

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  expect(
    getByText('Transcription failed. Click Retry to try again.'),
  ).toBeInTheDocument();
  expect(getByText('Retry')).toBeInTheDocument();
});

it('retries transcription on Retry click', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('error');
  const fakeBuffer = {} as AudioBuffer;
  mockRetrieveAudioBuffer.mockReturnValue(fakeBuffer);

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  fireEvent.click(getByText('Retry'));

  expect(mockTranscribe).toHaveBeenCalledWith('track-1', fakeBuffer);
});
