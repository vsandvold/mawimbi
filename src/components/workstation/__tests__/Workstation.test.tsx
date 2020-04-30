import { render } from '@testing-library/react';
import React from 'react';
import { AudioBuffer } from 'standardized-audio-context-mock';
import Scrubber from '../Scrubber';
import Workstation from '../Workstation';

jest.mock('../../../services/AudioService');

jest.mock('../EmptyTimeline', () => () => (
  <div data-testid="empty-timeline"></div>
));
jest.mock('../Mixer');
jest.mock('../Scrubber');
jest.mock('../Timeline', () => () => (
  <div data-testid="regular-timeline"></div>
));

// TODO: this pattern is useful for asserting the props passed to a child component
const mockScrubber = jest.fn(({ children }) => (
  <div data-testid="scrubber">{children}</div>
));
(Scrubber as jest.Mock).mockImplementation(mockScrubber);

const defaultTrack = {
  audioBuffer: new AudioBuffer({ length: 10, sampleRate: 44100 }),
  color: {
    r: 255,
    g: 255,
    b: 255,
  },
  id: 0,
  index: 0,
  mute: false,
  solo: false,
  volume: 100,
};

const defaultProps = {
  tracks: [],
  uploadFile: jest.fn(),
};

it('renders empty timeline when tracks are empty', () => {
  const { getByTestId } = render(
    <Workstation {...{ ...defaultProps, tracks: [] }} />
  );

  expect(getByTestId('empty-timeline')).toBeInTheDocument();
});

it('renders regular timeline when tracks are non-empty', () => {
  const { getByTestId } = render(
    <Workstation {...{ ...defaultProps, tracks: [defaultTrack] }} />
  );

  expect(getByTestId('regular-timeline')).toBeInTheDocument();
});

it('renders closed drawer by default', () => {
  const { container } = render(<Workstation {...defaultProps} />);

  const drawer = container.querySelector('.editor__drawer');

  expect(drawer).toHaveClass('editor__drawer--closed');
});

it('renders dropzone hidden by default', () => {
  const { container } = render(<Workstation {...defaultProps} />);

  const drawer = container.querySelector('.editor__dropzone');

  expect(drawer).toHaveClass('editor__dropzone--hidden');
});