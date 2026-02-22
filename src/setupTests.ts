import '@testing-library/jest-dom';
import { vi } from 'vitest';

window.TONE_SILENCE_LOGGING = true;

vi.mock('tone', () => {
  const makeNode = () => ({
    connect: vi.fn().mockReturnThis(),
    chain: vi.fn().mockReturnThis(),
    sync: vi.fn().mockReturnThis(),
    start: vi.fn().mockReturnThis(),
    toDestination: vi.fn().mockReturnThis(),
    dispose: vi.fn(),
    mute: false,
    solo: false,
    volume: { rampTo: vi.fn() },
    state: 'stopped',
    getValue: vi.fn().mockReturnValue(0),
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    stop: vi.fn().mockResolvedValue(new Blob()),
  });
  return {
    Meter: vi.fn().mockImplementation(makeNode),
    UserMedia: vi.fn().mockImplementation(makeNode),
    Player: vi.fn().mockImplementation(makeNode),
    Channel: vi.fn().mockImplementation(makeNode),
    Recorder: vi
      .fn()
      .mockImplementation(() => ({ ...makeNode(), state: 'stopped' })),
    Transport: {
      start: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      seconds: 0,
      state: 'stopped',
    },
    start: vi.fn().mockResolvedValue(undefined),
    getDestination: vi.fn().mockReturnValue(makeNode()),
    context: { decodeAudioData: vi.fn().mockResolvedValue({}) },
  };
});

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      pathname: 'path',
    }),
  };
});

const { mockCreate } = vi.hoisted(() => {
  const mockDestroy = vi.fn();
  const mockLoad = vi.fn().mockResolvedValue(undefined);
  const mockCreate = vi.fn().mockImplementation(() => ({
    destroy: mockDestroy,
    load: mockLoad,
  }));
  return { mockCreate };
});

vi.mock('wavesurfer.js', async () => {
  const actual =
    await vi.importActual<typeof import('wavesurfer.js')>('wavesurfer.js');
  return {
    ...actual,
    default: { create: mockCreate },
  };
});
