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

let mockIsTransportLocked = false;

vi.mock('../../recording/useRecordingService', () => ({
  useRecordingService: () => ({
    get isTransportLocked() {
      return mockIsTransportLocked;
    },
    getLoudness: () => 0,
  }),
}));

const mockOnToggleRecord = vi.fn();

const defaultProps = {
  isOpen: true,
  onOpenChange: vi.fn(),
  onHeightChange: vi.fn(),
  isCountingIn: false,
  isRecording: false,
  onToggleRecord: mockOnToggleRecord,
};

beforeEach(() => {
  mockIsTransportLocked = false;
  mockOnToggleRecord.mockClear();
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
  mockIsTransportLocked = true;
  const { getByTitle, getByText } = render(
    <RecordingBottomSheet {...defaultProps} isCountingIn={true} />,
  );

  expect(getByTitle('Cancel')).toBeInTheDocument();
  expect(getByText('Counting in…')).toBeInTheDocument();
});

it('shows "Stop" and "Recording…" while recording', () => {
  mockIsTransportLocked = true;
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

it('hides the close control while the transport is locked', () => {
  mockIsTransportLocked = true;
  const { queryByTitle } = render(
    <RecordingBottomSheet {...defaultProps} isRecording={true} />,
  );

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
