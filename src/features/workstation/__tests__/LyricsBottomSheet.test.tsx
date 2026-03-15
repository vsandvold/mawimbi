import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import { mockTrack } from '../../../testUtils';
import type { TranscriptionState } from '../../transcription/TranscriptionService';
import type { ClassificationResult } from '../../classification/InstrumentClassificationService';
import type { Transcription } from '../../transcription/types';
import type { TrackId } from '../../tracks/types';
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

let mockTransportTime = 0;
const mockSeekTo = vi.fn();

vi.mock('../../playback/usePlaybackService', () => ({
  usePlaybackService: () => ({
    get transportTime() {
      return mockTransportTime;
    },
    seekTo: mockSeekTo,
  }),
}));

vi.mock('../../tracks/useTrackService', () => ({
  useTrackService: () => ({
    retrieveAudioBuffer: mockRetrieveAudioBuffer,
  }),
}));

const mockGetClassification =
  vi.fn<(id: TrackId) => ClassificationResult | undefined>();

vi.mock('../../classification/useClassificationService', () => ({
  useClassificationService: () => ({
    getClassification: mockGetClassification,
  }),
}));

const mockTranscribe = vi.fn();
const mockLoadCachedTranscription = vi.fn().mockResolvedValue(null);
const mockGetTranscriptionState = vi.fn<(id: TrackId) => TranscriptionState>(
  () => 'idle',
);
const mockGetTranscription =
  vi.fn<(id: TrackId) => Transcription | undefined>();
let mockDownloadProgress: number | null = null;

vi.mock('../../transcription/useTranscriptionService', () => ({
  useTranscriptionService: () => ({
    getTranscriptionState: mockGetTranscriptionState,
    getTranscription: mockGetTranscription,
    get downloadProgress() {
      return mockDownloadProgress;
    },
    transcribe: mockTranscribe,
    loadCachedTranscription: mockLoadCachedTranscription,
  }),
}));

const defaultProps = {
  isOpen: true,
  onOpenChange: vi.fn(),
  onHeightChange: vi.fn(),
  onSeekTo: mockSeekTo,
  tracks: [] as ReturnType<typeof mockTrack>[],
};

beforeEach(() => {
  mockDownloadProgress = null;
  mockTransportTime = 0;
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

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const phrases = container.querySelectorAll('.lyrics-bottom-sheet__phrase');

  expect(phrases).toHaveLength(2);
  expect(phrases[0].textContent).toBe('Hello world');
  expect(phrases[1].textContent).toBe('goodbye world');
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

// --- Playback position following ---

it('marks words before transport time as played and active word as active', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world goodbye',
        start: 0,
        end: 2,
        words: [
          { text: 'Hello', start: 0, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
          { text: 'goodbye', start: 1.2, end: 1.6 },
        ],
      },
    ],
  });
  // Transport is at 0.5s — past "Hello" (end 0.3), inside "world" [0.35, 0.7)
  mockTransportTime = 0.5;

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const words = container.querySelectorAll('.lyrics-bottom-sheet__word');

  expect(words).toHaveLength(3);
  // "Hello" — transport (0.5) > end (0.3), so played
  expect(words[0]).toHaveClass('lyrics-bottom-sheet__word--played');
  // "world" — transport (0.5) is within [0.35, 0.7), so active
  expect(words[1]).toHaveClass('lyrics-bottom-sheet__word--active');
  // "goodbye" — transport (0.5) <= start (1.2), so upcoming
  expect(words[2]).not.toHaveClass('lyrics-bottom-sheet__word--played');
  expect(words[2]).not.toHaveClass('lyrics-bottom-sheet__word--active');
});

it('marks no words as played when transport time is zero', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world',
        start: 0,
        end: 1,
        words: [
          { text: 'Hello', start: 0, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
        ],
      },
    ],
  });
  mockTransportTime = 0;

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const playedWords = container.querySelectorAll(
    '.lyrics-bottom-sheet__word--played',
  );

  expect(playedWords).toHaveLength(0);
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

// --- Click-to-seek ---

it('seeks to word start time on word click', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world',
        start: 0,
        end: 1,
        words: [
          { text: 'Hello', start: 0.1, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
        ],
      },
    ],
  });

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  fireEvent.click(getByText('world'));

  expect(mockSeekTo).toHaveBeenCalledWith(0.35);
});

it('seeks with track startTime offset on word click', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello',
        start: 0,
        end: 0.5,
        words: [{ text: 'Hello', start: 0.1, end: 0.3 }],
      },
    ],
  });

  const tracks = [mockTrack({ trackId: 'track-1', startTime: 5 })];

  const { getByText } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  fireEvent.click(getByText('Hello'));

  expect(mockSeekTo).toHaveBeenCalledWith(5.1);
});

// --- Active word highlighting ---

it('highlights the active word during playback', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world goodbye',
        start: 0,
        end: 2,
        words: [
          { text: 'Hello', start: 0, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
          { text: 'goodbye', start: 1.2, end: 1.6 },
        ],
      },
    ],
  });
  // Transport at 0.5s — inside "world" [0.35, 0.7)
  mockTransportTime = 0.5;

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const activeWords = container.querySelectorAll(
    '.lyrics-bottom-sheet__word--active',
  );

  expect(activeWords).toHaveLength(1);
  expect(activeWords[0].textContent).toContain('world');
});

it('accounts for track startTime when highlighting active word', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world',
        start: 0,
        end: 1,
        words: [
          { text: 'Hello', start: 0, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
        ],
      },
    ],
  });
  // Track starts at 5s, transport at 5.4s → relative time 0.4s → inside "world" [0.35, 0.7)
  mockTransportTime = 5.4;

  const tracks = [mockTrack({ trackId: 'track-1', startTime: 5 })];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const activeWords = container.querySelectorAll(
    '.lyrics-bottom-sheet__word--active',
  );

  expect(activeWords).toHaveLength(1);
  expect(activeWords[0].textContent).toContain('world');
});

it('uses track-relative time for played and active word styling', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world goodbye',
        start: 0,
        end: 2,
        words: [
          { text: 'Hello', start: 0, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
          { text: 'goodbye', start: 1.2, end: 1.6 },
        ],
      },
    ],
  });
  // Track starts at 10s, transport at 10.5s → relative time 0.5
  // "Hello" [0, 0.3) → played, "world" [0.35, 0.7) → active, "goodbye" → upcoming
  mockTransportTime = 10.5;

  const tracks = [mockTrack({ trackId: 'track-1', startTime: 10 })];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const words = container.querySelectorAll('.lyrics-bottom-sheet__word');

  expect(words[0]).toHaveClass('lyrics-bottom-sheet__word--played');
  expect(words[1]).toHaveClass('lyrics-bottom-sheet__word--active');
  expect(words[2]).not.toHaveClass('lyrics-bottom-sheet__word--played');
  expect(words[2]).not.toHaveClass('lyrics-bottom-sheet__word--active');
});

it('words have cursor pointer style', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello',
        start: 0,
        end: 0.5,
        words: [{ text: 'Hello', start: 0, end: 0.3 }],
      },
    ],
  });

  const tracks = [mockTrack({ trackId: 'track-1' })];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const word = container.querySelector('.lyrics-bottom-sheet__word');

  expect(word?.tagName).toBe('SPAN');
  // Word should be clickable — verify it has a click handler by checking role
  expect(word).toHaveAttribute('role', 'button');
});

// --- Track color on active word ---

it('uses track color as active word text color', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');
  mockGetTranscription.mockReturnValue({
    trackId: 'track-1',
    language: 'en',
    segments: [
      {
        text: 'Hello world',
        start: 0,
        end: 1,
        words: [
          { text: 'Hello', start: 0, end: 0.3 },
          { text: 'world', start: 0.35, end: 0.7 },
        ],
      },
    ],
  });
  mockTransportTime = 0.5;

  const tracks = [
    mockTrack({ trackId: 'track-1', color: { r: 77, g: 238, b: 234 } }),
  ];

  const { container } = render(
    <LyricsBottomSheet {...defaultProps} tracks={tracks} />,
  );

  const activeWord = container.querySelector(
    '.lyrics-bottom-sheet__word--active',
  );

  expect(activeWord).toHaveStyle({
    color: 'rgb(77,238,234)',
  });
});

// --- Load cached transcriptions on open ---

it('loads cached transcriptions from IndexedDB when sheet opens', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('idle');

  const tracks = [
    mockTrack({ trackId: 'track-1' }),
    mockTrack({ trackId: 'track-2' }),
  ];

  render(<LyricsBottomSheet {...defaultProps} isOpen={true} tracks={tracks} />);

  expect(mockLoadCachedTranscription).toHaveBeenCalledWith('track-1');
  expect(mockLoadCachedTranscription).toHaveBeenCalledWith('track-2');
});

it('does not load cached transcriptions when sheet is closed', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });

  const tracks = [mockTrack({ trackId: 'track-1' })];

  render(
    <LyricsBottomSheet {...defaultProps} isOpen={false} tracks={tracks} />,
  );

  expect(mockLoadCachedTranscription).not.toHaveBeenCalled();
});

it('does not load cached transcriptions for tracks already transcribed', () => {
  mockGetClassification.mockReturnValue({ label: 'vocals', score: 0.93 });
  mockGetTranscriptionState.mockReturnValue('done');

  const tracks = [mockTrack({ trackId: 'track-1' })];

  render(<LyricsBottomSheet {...defaultProps} isOpen={true} tracks={tracks} />);

  expect(mockLoadCachedTranscription).not.toHaveBeenCalled();
});
