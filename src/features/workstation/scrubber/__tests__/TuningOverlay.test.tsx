import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { toast } from 'sonner';
import { activeRunwayConfig, beatSaber } from '../runwayConfig';
import { solveGeometry } from '../runwayProjection';
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

function renderOverlay(
  overrides: Partial<ComponentProps<typeof TuningOverlay>> = {},
) {
  const close = vi.fn();
  const selectPreset = vi.fn();
  const setValue = vi.fn();
  const utils = render(
    <TuningOverlay
      config={activeRunwayConfig}
      geometry={geometry}
      close={close}
      selectPreset={selectPreset}
      setValue={setValue}
      {...overrides}
    />,
  );
  return { ...utils, close, selectPreset, setValue };
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

it('renders a slider per RunwayConfig knob showing the current config value', () => {
  renderOverlay();

  expect(screen.getByText('70deg')).toBeInTheDocument(); // tiltDeg
  expect(screen.getByText('0.65')).toBeInTheDocument(); // playheadWidth
  expect(screen.getByText('1800px')).toBeInTheDocument(); // runwayLengthPx
});

it('renders a readout of the solved geometry', () => {
  renderOverlay();

  expect(
    screen.getByText(`${geometry.horizonY.toFixed(1)}px`),
  ).toBeInTheDocument();
  expect(
    screen.getByText(`${geometry.perspectivePx.toFixed(1)}px`),
  ).toBeInTheDocument();
});

it('calls selectPreset when a preset is chosen from the dropdown', async () => {
  const user = userEvent.setup();
  const { selectPreset, container } = renderOverlay();

  const presetTrigger = container.querySelector(
    '.tuning-overlay__preset',
  ) as HTMLElement;
  await user.click(presetTrigger);
  const beatSaberOption = await screen.findByText('beatSaber');
  await user.click(beatSaberOption);

  expect(selectPreset).toHaveBeenCalledWith(beatSaber);
});

it('calls setValue when a slider is dragged', () => {
  const { setValue } = renderOverlay();

  const tiltSlider = screen.getAllByRole('slider')[0];
  fireEvent.keyDown(tiltSlider, { key: 'ArrowRight' });

  expect(setValue).toHaveBeenCalledWith('tiltDeg', expect.any(Number));
});

it('copies the serialized preset to the clipboard', async () => {
  renderOverlay();

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

it('shows an error toast when the clipboard write fails', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    configurable: true,
  });
  renderOverlay();

  fireEvent.click(screen.getByRole('button', { name: /Copy preset/ }));

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalled();
  });
  expect(toast.success).not.toHaveBeenCalled();
});

it('calls close when the close button is clicked', async () => {
  const user = userEvent.setup();
  const { close } = renderOverlay();

  await user.click(screen.getByTitle('Close tuning overlay'));

  expect(close).toHaveBeenCalled();
});
