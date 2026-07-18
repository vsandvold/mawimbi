import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { activeRunwayConfig, beatSaber } from '../runwayConfig';
import { solveGeometry } from '../runwayProjection';
import {
  getConfigOverride,
  resetTuningSignals,
  toggleTuningOverlay,
} from '../tuningSignals';
import TuningOverlay from '../TuningOverlay';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    warning: vi.fn(),
  },
}));

const geometry = solveGeometry(activeRunwayConfig, {
  width: 1000,
  height: 650,
});

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  resetTuningSignals();
  vi.clearAllMocks();
});

it('renders nothing when the overlay has not been opened', () => {
  const { container } = render(<TuningOverlay geometry={geometry} />);

  expect(container.querySelector('.tuning-overlay')).toBeNull();
});

it('renders a slider per RunwayConfig knob showing the current override value', () => {
  toggleTuningOverlay(activeRunwayConfig);

  render(<TuningOverlay geometry={geometry} />);

  expect(screen.getByText('70deg')).toBeInTheDocument(); // tiltDeg
  expect(screen.getByText('0.65')).toBeInTheDocument(); // playheadWidth
  expect(screen.getByText('1800px')).toBeInTheDocument(); // runwayLengthPx
});

it('renders a readout of the solved geometry', () => {
  toggleTuningOverlay(activeRunwayConfig);

  render(<TuningOverlay geometry={geometry} />);

  expect(
    screen.getByText(`${geometry.horizonY.toFixed(1)}px`),
  ).toBeInTheDocument();
  expect(
    screen.getByText(`${geometry.perspectivePx.toFixed(1)}px`),
  ).toBeInTheDocument();
});

it('replaces the override when a preset is selected from the dropdown', async () => {
  const user = userEvent.setup();
  toggleTuningOverlay(activeRunwayConfig);

  render(<TuningOverlay geometry={geometry} />);

  await user.click(screen.getByRole('button', { name: 'Preset' }));
  const beatSaberOption = await screen.findByText('beatSaber');
  await user.click(beatSaberOption);

  expect(getConfigOverride()).toEqual(beatSaber);
});

it('copies the serialized preset to the clipboard', async () => {
  toggleTuningOverlay(activeRunwayConfig);

  render(<TuningOverlay geometry={geometry} />);

  // fireEvent (not userEvent) here — userEvent.setup() installs its own
  // clipboard stub that would shadow the beforeEach spy above.
  fireEvent.click(screen.getByRole('button', { name: /Copy preset/ }));

  await waitFor(() => {
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('tiltDeg: 70'),
    );
  });
  expect(toast.success).toHaveBeenCalled();
});

it('closes the overlay when the close button is clicked', async () => {
  const user = userEvent.setup();
  toggleTuningOverlay(activeRunwayConfig);

  render(<TuningOverlay geometry={geometry} />);

  await user.click(screen.getByTitle('Close tuning overlay'));

  expect(getConfigOverride()).toBeNull();
});
