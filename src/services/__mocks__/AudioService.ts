import Mixer from '../Mixer';

jest.mock('../Mixer');

const instance = {
  mixer: new Mixer(),
  createTrack: jest.fn(),
  retrieveAudioBuffer: jest.fn(),
  startPlayback: jest.fn(),
  pausePlayback: jest.fn(),
  stopPlayback: jest.fn(),
  togglePlayback: jest.fn(),
  getTransportTime: jest.fn(),
  setTransportTime: jest.fn(),
  getTotalTime: jest.fn(),
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  isRecording: jest.fn(),
};

class AudioService {
  static getInstance() {
    return instance;
  }
}

export default AudioService;
