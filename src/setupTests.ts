// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';
import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import 'jest-enzyme';

configure({ adapter: new Adapter() });

mockReactRouterDom();

function mockReactRouterDom() {
  const mockHistoryGoBack = jest.fn();
  const mockHistoryPush = jest.fn();

  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useHistory: () => ({
      goBack: mockHistoryGoBack,
      push: mockHistoryPush,
    }),
    useLocation: () => ({
      pathname: 'path',
    }),
  }));
}

mockWaveSurfer();

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
