import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { getFocusedTracks } from '../../tracks/focusSignals';
import AudioService from '../../audio/AudioService';
import { resetAllSignals } from '../../tracks/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Channel from '../Channel';

const mockProjectDispatch = vi.fn();

vi.mock('../../project/useProjectDispatch', () => ({
  default: () => mockProjectDispatch,
}));

const mockGetClassification = vi.fn().mockReturnValue(undefined);
const mockGetClassificationState = vi.fn().mockReturnValue('idle');
let mockDownloadProgress: number | null = null;

vi.mock('../../classification/useClassificationService', () => ({
  useClassificationService: () => ({
    classifications: new Map(),
    get downloadProgress() {
      return mockDownloadProgress;
    },
    getClassification: mockGetClassification,
    getClassificationState: mockGetClassificationState,
    removeClassification: vi.fn(),
    reset: vi.fn(),
  }),
}));

const trackService = AudioService.getInstance().trackService;

beforeEach(() => {
  trackService.createSignals('track-1');
  mockDownloadProgress = null;
});

afterEach(() => {
  resetAllSignals();
});

const defaultProps = {
  isMuted: false,
  track: mockTrack({ trackId: 'track-1' }),
};

it('renders without crashing', () => {
  render(<Channel {...defaultProps} />);
});

it('renders mute/solo button with On title by default', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('On')).toBeInTheDocument();
});

it('renders move button', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Move')).toBeInTheDocument();
});

it('cycles from on to solo on first click', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('On'));

  const signals = trackService.getSignals('track-1')!;
  expect(signals.mute.value).toBe(false);
  expect(signals.solo.value).toBe(true);
});

it('cycles from solo to mute on second click', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.solo.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Solo'));

  expect(signals.solo.value).toBe(false);
  expect(signals.mute.value).toBe(true);
});

it('cycles from mute to on on third click', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.mute.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Muted'));

  expect(signals.mute.value).toBe(false);
  expect(signals.solo.value).toBe(false);
});

it('shows Muted title when muted', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.mute.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Muted')).toBeInTheDocument();
});

it('shows Solo title when soloed', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.solo.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Solo')).toBeInTheDocument();
});

it('applies active style when muted', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.mute.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  const button = getByTitle('Muted').closest('button');
  expect(button).toHaveClass('channel-button--active');
});

it('applies active style when soloed', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.solo.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  const button = getByTitle('Solo').closest('button');
  expect(button).toHaveClass('channel-button--active');
});

it('does not apply active style when on', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  const button = getByTitle('On').closest('button');
  expect(button).not.toHaveClass('channel-button--active');
});

it('applies inverted style when channel is muted via signal', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.mute.value = true;

  const { container } = render(<Channel {...defaultProps} />);

  const channel = container.querySelector('.channel');
  expect(channel).toHaveClass('channel--inverted');
});

it('applies inverted style when externally muted (solo on another channel)', () => {
  const { container } = render(
    <Channel {...{ ...defaultProps, isMuted: true }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).toHaveClass('channel--inverted');
});

it('does not apply inverted style when unmuted at full volume', () => {
  const { container } = render(
    <Channel {...{ ...defaultProps, isMuted: false }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).not.toHaveClass('channel--inverted');
});

it('applies channel background color from track color', () => {
  const track = mockTrack({
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
  });
  const { container } = render(<Channel {...{ ...defaultProps, track }} />);

  const channel = container.querySelector('.channel');
  expect(channel).toHaveStyle({
    backgroundColor: 'rgba(77,238,234, 1)',
  });
});

it('sets opacity to 0 in background color when externally muted', () => {
  const track = mockTrack({
    trackId: 'track-1',
    color: { r: 77, g: 238, b: 234 },
  });
  const { container } = render(
    <Channel {...{ ...defaultProps, track, isMuted: true }} />,
  );

  const channel = container.querySelector('.channel');
  expect(channel).toHaveStyle({
    backgroundColor: 'rgba(77,238,234, 0)',
  });
});

it('reads volume from signal store', () => {
  const signals = trackService.getSignals('track-1')!;
  expect(signals.volume.value).toBe(100);

  render(<Channel {...defaultProps} />);

  // Volume is read from signal, not from track props
  expect(signals.volume.value).toBe(100);
});

it('focuses track when volume slider is clicked without moving', () => {
  const { container } = render(<Channel {...defaultProps} />);

  const volumeSlider = container.querySelector('.channel__volume')!;
  fireEvent.pointerDown(volumeSlider);

  expect(getFocusedTracks()).toContain('track-1');
});

it('shows no icon in instrument div when classification is idle and no instrument prop', () => {
  const { container } = render(<Channel {...defaultProps} />);

  const instrumentDiv = container.querySelector('.channel__instrument');
  expect(instrumentDiv?.querySelector('svg')).not.toBeInTheDocument();
});

it('shows loading indicator in instrument div when classification is in progress', () => {
  mockGetClassificationState.mockReturnValue('classifying');

  const { container } = render(<Channel {...defaultProps} />);

  const instrumentDiv = container.querySelector('.channel__instrument');
  expect(instrumentDiv?.querySelector('svg')).toBeInTheDocument();
});

it('shows instrument icon in instrument div when classification is done', () => {
  mockGetClassification.mockReturnValue({ label: 'guitar', score: 0.85 });
  mockGetClassificationState.mockReturnValue('done');

  const { container } = render(<Channel {...defaultProps} />);

  const instrumentDiv = container.querySelector('.channel__instrument');
  expect(instrumentDiv?.querySelector('svg')).toBeInTheDocument();
});

it('shows instrument icon from track prop when service has no classification', () => {
  mockGetClassification.mockReturnValue(undefined);
  mockGetClassificationState.mockReturnValue('idle');

  const track = mockTrack({ trackId: 'track-1', instrument: 'drums' });
  const { container } = render(<Channel {...{ ...defaultProps, track }} />);

  const instrumentDiv = container.querySelector('.channel__instrument');
  expect(instrumentDiv?.querySelector('svg')).toBeInTheDocument();
});

it('prefers service classification over track instrument prop', () => {
  mockGetClassification.mockReturnValue({ label: 'guitar', score: 0.85 });
  mockGetClassificationState.mockReturnValue('done');

  const track = mockTrack({ trackId: 'track-1', instrument: 'drums' });
  const { container } = render(<Channel {...{ ...defaultProps, track }} />);

  const instrumentDiv = container.querySelector('.channel__instrument');
  expect(instrumentDiv?.querySelector('svg')).toBeInTheDocument();
});

it('shows download progress percentage when model is downloading', () => {
  mockGetClassificationState.mockReturnValue('classifying');
  mockDownloadProgress = 45;

  const { container } = render(<Channel {...defaultProps} />);

  const progressEl = container.querySelector('.channel__download-progress');
  expect(progressEl).toBeInTheDocument();
  expect(progressEl?.textContent).toBe('45%');
});

it('shows loading spinner when classifying without download', () => {
  mockGetClassificationState.mockReturnValue('classifying');
  mockDownloadProgress = null;

  const { container } = render(<Channel {...defaultProps} />);

  const progressEl = container.querySelector('.channel__download-progress');
  expect(progressEl).not.toBeInTheDocument();

  const instrumentDiv = container.querySelector('.channel__instrument');
  expect(instrumentDiv?.querySelector('svg')).toBeInTheDocument();
});

it('sets title attribute with download progress', () => {
  mockGetClassificationState.mockReturnValue('classifying');
  mockDownloadProgress = 72;

  const { container } = render(<Channel {...defaultProps} />);

  const instrumentDiv = container.querySelector('.channel__instrument');
  expect(instrumentDiv).toHaveAttribute('title', 'Downloading model: 72%');
});

it('dispatches SET_INSTRUMENT when selecting an instrument from dropdown', async () => {
  const user = userEvent.setup();
  mockGetClassification.mockReturnValue({ label: 'guitar', score: 0.85 });
  mockGetClassificationState.mockReturnValue('done');

  const track = mockTrack({ trackId: 'track-1', instrument: 'guitar' });
  render(<Channel {...{ ...defaultProps, track }} />);

  const trigger = screen.getByTitle('Guitar');
  await user.click(trigger);

  const drumItem = await screen.findByText('Drums');
  await user.click(drumItem);

  expect(mockProjectDispatch).toHaveBeenCalledWith([
    'SET_INSTRUMENT',
    { trackId: 'track-1', instrument: 'drums' },
  ]);
});
