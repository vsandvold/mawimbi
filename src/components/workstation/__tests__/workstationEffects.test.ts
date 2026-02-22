import { fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import {
  resetTransportSignals,
  isPlaying,
} from '../../../signals/transportSignals';
import { useSpacebarPlaybackToggle } from '../workstationEffects';

vi.mock('../../../services/AudioService', () => ({
  default: {
    getInstance: vi.fn().mockReturnValue({
      startPlayback: vi.fn(),
      pausePlayback: vi.fn(),
      setTransportTime: vi.fn(),
      mixer: { getMutedChannels: vi.fn().mockReturnValue([]) },
    }),
  },
}));

afterEach(() => {
  resetTransportSignals();
});

it('toggles playback with spacebar', () => {
  renderHook(() => useSpacebarPlaybackToggle());

  expect(isPlaying.value).toBe(false);

  fireEvent.keyUp(window, { key: ' ', code: 'Space' });

  expect(isPlaying.value).toBe(true);
});
