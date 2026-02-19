import '@testing-library/jest-dom';
import { vi } from 'vitest';

window.TONE_SILENCE_LOGGING = true;

const { mockHistoryGoBack, mockHistoryPush } = vi.hoisted(() => ({
  mockHistoryGoBack: vi.fn(),
  mockHistoryPush: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );
  return {
    ...actual,
    useHistory: () => ({
      goBack: mockHistoryGoBack,
      push: mockHistoryPush,
    }),
    useLocation: () => ({
      pathname: 'path',
    }),
  };
});

const { mockDestroy, mockLoadDecodedBuffer, mockCreate } = vi.hoisted(() => {
  const mockDestroy = vi.fn();
  const mockLoadDecodedBuffer = vi.fn();
  const mockCreate = vi.fn().mockImplementation(() => ({
    destroy: mockDestroy,
    loadDecodedBuffer: mockLoadDecodedBuffer,
  }));
  return { mockDestroy, mockLoadDecodedBuffer, mockCreate };
});

vi.mock('wavesurfer.js', async () => {
  const actual =
    await vi.importActual<typeof import('wavesurfer.js')>('wavesurfer.js');
  return {
    ...actual,
    default: { create: mockCreate },
  };
});
