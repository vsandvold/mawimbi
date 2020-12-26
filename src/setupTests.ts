// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

window.TONE_SILENCE_LOGGING = true;

// mockWaveSurfer();

function mockWaveSurfer() {
  const mockDestroy = jest.fn();
  const mockLoadDecodedBuffer = jest.fn();

  const mockCreate = jest.fn().mockImplementation(() => {
    return {
      destroy: mockDestroy,
      loadDecodedBuffer: mockLoadDecodedBuffer,
    };
  });

  jest.mock('wavesurfer.js', () => ({
    ...jest.requireActual('wavesurfer.js'),
    create: mockCreate,
  }));
}
