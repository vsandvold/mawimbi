import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';

import { getFocusedTracks } from '../../../signals/focusSignals';
import AudioService from '../../../services/AudioService';
import { resetAllSignals } from '../../../signals/__tests__/testUtils';
import { mockTrack } from '../../../testUtils';
import Channel from '../Channel';

const mockGetClassification = vi.fn().mockReturnValue(undefined);
const mockGetClassificationState = vi.fn().mockReturnValue('idle');

vi.mock('../../../hooks/useClassificationService', () => ({
  useClassificationService: () => ({
    classifications: new Map(),
    getClassification: mockGetClassification,
    getClassificationState: mockGetClassificationState,
    removeClassification: vi.fn(),
    reset: vi.fn(),
  }),
}));

const trackService = AudioService.getInstance().trackService;

beforeEach(() => {
  trackService.createSignals('track-1');
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

it('renders mute button', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Mute')).toBeInTheDocument();
});

it('renders solo button', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Solo')).toBeInTheDocument();
});

it('renders move button', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  expect(getByTitle('Move')).toBeInTheDocument();
});

it('sets mute signal when mute button is clicked', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Mute'));

  const signals = trackService.getSignals('track-1')!;
  expect(signals.mute.value).toBe(true);
});

it('unsets mute signal when mute button is clicked while muted', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.mute.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Mute'));

  expect(signals.mute.value).toBe(false);
});

it('sets solo signal when solo button is clicked', () => {
  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Solo'));

  const signals = trackService.getSignals('track-1')!;
  expect(signals.solo.value).toBe(true);
});

it('unsets solo signal when solo button is clicked while solo', () => {
  const signals = trackService.getSignals('track-1')!;
  signals.solo.value = true;

  const { getByTitle } = render(<Channel {...defaultProps} />);

  fireEvent.click(getByTitle('Solo'));

  expect(signals.solo.value).toBe(false);
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

it('renders instrument icon area inside swipe div', () => {
  const { container } = render(<Channel {...defaultProps} />);

  const swipe = container.querySelector('.channel__swipe');
  const instrumentArea = swipe?.querySelector('.channel__instrument');
  expect(instrumentArea).toBeInTheDocument();
});

it('shows no icon when classification is idle and no instrument prop', () => {
  const { container } = render(<Channel {...defaultProps} />);

  const instrumentArea = container.querySelector('.channel__instrument');
  expect(instrumentArea?.children).toHaveLength(0);
});

it('shows loading indicator when classification is in progress', () => {
  mockGetClassificationState.mockReturnValue('classifying');

  const { container } = render(<Channel {...defaultProps} />);

  const instrumentArea = container.querySelector('.channel__instrument');
  expect(instrumentArea?.querySelector('[role="img"]')).toBeInTheDocument();
});

it('shows instrument icon when classification is done', () => {
  mockGetClassification.mockReturnValue({ label: 'guitar', score: 0.85 });
  mockGetClassificationState.mockReturnValue('done');

  const { container } = render(<Channel {...defaultProps} />);

  const instrumentArea = container.querySelector('.channel__instrument');
  expect(instrumentArea?.querySelector('[role="img"]')).toBeInTheDocument();
});

it('shows instrument icon from track prop when service has no classification', () => {
  mockGetClassification.mockReturnValue(undefined);
  mockGetClassificationState.mockReturnValue('idle');

  const track = mockTrack({ trackId: 'track-1', instrument: 'drums' });
  const { container } = render(<Channel {...{ ...defaultProps, track }} />);

  const instrumentArea = container.querySelector('.channel__instrument');
  expect(instrumentArea?.querySelector('[role="img"]')).toBeInTheDocument();
});

it('prefers service classification over track instrument prop', () => {
  mockGetClassification.mockReturnValue({ label: 'guitar', score: 0.85 });
  mockGetClassificationState.mockReturnValue('done');

  const track = mockTrack({ trackId: 'track-1', instrument: 'drums' });
  const { container } = render(<Channel {...{ ...defaultProps, track }} />);

  const instrumentArea = container.querySelector('.channel__instrument');
  expect(instrumentArea?.querySelector('[role="img"]')).toBeInTheDocument();
});
