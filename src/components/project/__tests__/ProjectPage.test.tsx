import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import AudioService from '../../../services/AudioService';
import ProjectPage from '../ProjectPage';

jest.mock('../../../services/AudioService');

const audioFile = new File(['(⌐□_□)'], 'chucknorris.png', {
  type: 'audio/mp3',
});

const otherFile = new File(['(⌐□_□)'], 'chucknorris.png', {
  type: 'image/png',
});

it('creates a new empty project', () => {
  const audioService = AudioService.getInstance();
  (audioService.mixer.getMutedChannels as jest.Mock).mockReturnValue([]);

  render(<ProjectPage />);

  expect(screen.getByText(/New Project/i)).toBeInTheDocument();
  expect(screen.getByText(/Upload Files/i)).toBeEnabled();
  expect(
    screen.getByText(/Start recording, or upload some audio files/i)
  ).toBeInTheDocument();
  expect(screen.getByTitle(/Show Mixer/i)).toBeDisabled();
  expect(screen.getByTitle(/Play/i)).toBeDisabled();
  expect(screen.getByTitle(/Record/i)).toBeEnabled();
});

it('adds uploaded file to project as new track', async () => {
  const audioService = AudioService.getInstance();
  (audioService.mixer.getMutedChannels as jest.Mock).mockReturnValue([]);
  (audioService.createTrack as jest.Mock).mockResolvedValue('newTrack123');

  const { container } = render(<ProjectPage />);

  const inputEl = container.querySelector('.ant-upload input[type="file"]');

  userEvent.upload(inputEl!, [audioFile]);

  await screen.findByTestId(/timeline/);

  expect(screen.getByTitle(/Show Mixer/i)).toBeEnabled();
  expect(screen.getByTitle(/Play/i)).toBeEnabled();
});

it('accepts dropped audio file', async () => {
  const audioService = AudioService.getInstance();
  (audioService.mixer.getMutedChannels as jest.Mock).mockReturnValue([]);
  (audioService.createTrack as jest.Mock).mockResolvedValue('newTrack123');

  const { container } = render(<ProjectPage />);

  const editor = container.querySelector('.editor');

  fireEvent.dragEnter(editor!, {
    dataTransfer: {
      files: [otherFile],
      items: [otherFile].map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    },
  });

  await screen.findByText(/Oops, this does not look like an audio file/i);

  fireEvent.dragLeave(editor!);

  fireEvent.dragEnter(editor!, {
    dataTransfer: {
      files: [audioFile],
      items: [audioFile].map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    },
  });

  await screen.findByText(/Drag and drop audio files here/i);

  const dropzone = screen.getByTestId(/dropzone/);

  fireEvent.drop(dropzone, {
    dataTransfer: {
      files: [audioFile],
      items: [audioFile].map((file) => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
      types: ['Files'],
    },
  });

  await screen.findByTestId(/timeline/);
});

it.skip('enters and exits fullscreen when requested by user', () => {
  const audioService = AudioService.getInstance();
  (audioService.mixer.getMutedChannels as jest.Mock).mockReturnValue([]);

  const { container } = render(<ProjectPage />);

  const menu = container.querySelector('.overflow-button');
  fireEvent.click(menu!);

  const menuItem = screen.getByText(/Enter Full Screen/i);
  fireEvent.click(menuItem!);

  const fullscreenEl = container.querySelector(':fullscreen');
  expect(fullscreenEl).toBeInTheDocument();
});
