import { fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import RecordingBottomSheet from '../RecordingBottomSheet';

vi.mock('../BottomSheet', () => ({
  default: ({
    title,
    showClose,
    children,
  }: {
    title: string;
    showClose?: boolean;
    children: React.ReactNode;
  }) => (
    <div data-testid="bottom-sheet" data-title={title}>
      {showClose !== false && <button title="Close" />}
      {children}
    </div>
  ),
}));

// MicLevelMeter (rendered as a child) calls this for the meter bar.
vi.mock('../../recording/useRecordingService', () => ({
  useRecordingService: () => ({
    getLoudness: () => 0,
  }),
}));

const mockOnToggleRecord = vi.fn();
const mockOnToggleMonitoring = vi.fn();
const mockOnMonitorVolumeChange = vi.fn();

const defaultProps = {
  isOpen: true,
  onOpenChange: vi.fn(),
  onHeightChange: vi.fn(),
  isCountingIn: false,
  isRecording: false,
  onToggleRecord: mockOnToggleRecord,
  isMonitoring: false,
  monitorVolume: 50,
  onToggleMonitoring: mockOnToggleMonitoring,
  onMonitorVolumeChange: mockOnMonitorVolumeChange,
};

beforeEach(() => {
  mockOnToggleRecord.mockClear();
  mockOnToggleMonitoring.mockClear();
  mockOnMonitorVolumeChange.mockClear();
});

it('passes title "Recording" to BottomSheet', () => {
  const { getByTestId } = render(<RecordingBottomSheet {...defaultProps} />);

  expect(getByTestId('bottom-sheet')).toHaveAttribute(
    'data-title',
    'Recording',
  );
});

it('shows "Record" and "Ready to record" when idle', () => {
  const { getByTitle, getByText } = render(
    <RecordingBottomSheet {...defaultProps} />,
  );

  expect(getByTitle('Record')).toBeInTheDocument();
  expect(getByText('Ready to record')).toBeInTheDocument();
});

it('shows "Cancel" and "Counting in…" while counting in', () => {
  const { getByTitle, getByText } = render(
    <RecordingBottomSheet {...defaultProps} isCountingIn={true} />,
  );

  expect(getByTitle('Cancel')).toBeInTheDocument();
  expect(getByText('Counting in…')).toBeInTheDocument();
});

it('shows "Stop" and "Recording…" while recording', () => {
  const { getByTitle, getByText } = render(
    <RecordingBottomSheet {...defaultProps} isRecording={true} />,
  );

  expect(getByTitle('Stop')).toBeInTheDocument();
  expect(getByText('Recording…')).toBeInTheDocument();
});

it('calls onToggleRecord when the record control is clicked', () => {
  const { getByTitle } = render(<RecordingBottomSheet {...defaultProps} />);

  fireEvent.click(getByTitle('Record'));

  expect(mockOnToggleRecord).toHaveBeenCalledOnce();
});

it('hides the close control while counting in or recording', () => {
  const { queryByTitle, rerender } = render(
    <RecordingBottomSheet {...defaultProps} isCountingIn={true} />,
  );
  expect(queryByTitle('Close')).not.toBeInTheDocument();

  rerender(<RecordingBottomSheet {...defaultProps} isRecording={true} />);
  expect(queryByTitle('Close')).not.toBeInTheDocument();
});

it('shows the close control when idle', () => {
  const { getByTitle } = render(<RecordingBottomSheet {...defaultProps} />);

  expect(getByTitle('Close')).toBeInTheDocument();
});

it('renders the mic level meter', () => {
  const { getByTestId } = render(<RecordingBottomSheet {...defaultProps} />);

  expect(getByTestId('mic-level-meter')).toBeInTheDocument();
});

it('shows "Enable monitoring" when monitoring is off', () => {
  const { getByTitle } = render(<RecordingBottomSheet {...defaultProps} />);

  expect(getByTitle('Enable monitoring')).toBeInTheDocument();
});

it('shows "Disable monitoring" when monitoring is on', () => {
  const { getByTitle } = render(
    <RecordingBottomSheet {...defaultProps} isMonitoring={true} />,
  );

  expect(getByTitle('Disable monitoring')).toBeInTheDocument();
});

it('calls onToggleMonitoring when the monitor toggle is clicked', () => {
  const { getByTitle } = render(<RecordingBottomSheet {...defaultProps} />);

  fireEvent.click(getByTitle('Enable monitoring'));

  expect(mockOnToggleMonitoring).toHaveBeenCalledOnce();
});

it('renders the monitor volume slider with the current value', () => {
  const { getByRole } = render(
    <RecordingBottomSheet {...defaultProps} monitorVolume={75} />,
  );

  expect(getByRole('slider')).toHaveAttribute('aria-valuenow', '75');
});
