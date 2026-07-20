import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import {
  getConfigOverride,
  resetTuningSignals,
} from '../scrubber/tuningSignals';
import ToolbarBottomSheet from '../ToolbarBottomSheet';

const defaultProps = {
  isMixerOpen: false,
  isLyricsOpen: false,
  isEffectsOpen: false,
  isEffectsDisabled: false,
  isEmpty: false,
  onToggleMixer: vi.fn(),
  onToggleLyrics: vi.fn(),
  onToggleEffects: vi.fn(),
  uploadFile: vi.fn(),
  isFullscreen: false,
  toggleFullscreen: vi.fn(),
  isLogOverlayOpen: false,
  toggleLogOverlay: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  canUndo: false,
  canRedo: false,
  onRewind: vi.fn(),
  onToggleRecording: vi.fn(),
  sheetOffset: 0,
};

afterEach(() => {
  vi.unstubAllEnvs();
  act(() => {
    resetTuningSignals();
  });
});

async function openOverflowMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('More'));
  return user;
}

it('shows the runway tuning option when tuning is available', async () => {
  vi.stubEnv('DEV', true);
  render(<ToolbarBottomSheet {...defaultProps} />);

  await openOverflowMenu();

  expect(await screen.findByText('Show Runway Tuning')).toBeInTheDocument();
});

it('hides the runway tuning option when tuning is unavailable', async () => {
  vi.stubEnv('DEV', false);
  render(<ToolbarBottomSheet {...defaultProps} />);

  await openOverflowMenu();

  expect(await screen.findByText('View Logs')).toBeInTheDocument();
  expect(screen.queryByText('Show Runway Tuning')).toBeNull();
});

it('toggles the runway tuning overlay when the menu item is clicked', async () => {
  vi.stubEnv('DEV', true);
  render(<ToolbarBottomSheet {...defaultProps} />);

  const user = await openOverflowMenu();
  await user.click(await screen.findByText('Show Runway Tuning'));

  await openOverflowMenu();
  expect(await screen.findByText('Hide Runway Tuning')).toBeInTheDocument();
});

it('disables the runway tuning option on an empty project', async () => {
  // TuningOverlay only renders inside Scrubber, which Workstation unmounts
  // when there's no timeline to show — the menu item must not be able to
  // toggle the signal with nothing mounted to display it.
  vi.stubEnv('DEV', true);
  render(<ToolbarBottomSheet {...defaultProps} isEmpty={true} />);

  const user = await openOverflowMenu();
  const tuningItem = await screen.findByText('Show Runway Tuning');
  await user.click(tuningItem);

  expect(getConfigOverride()).toBeNull();
});
