import { render } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { useBrowserSupport } from '../../../browserSupport';
import EmptyTimeline from '../EmptyTimeline';

vi.mock('../../../browserSupport');

const defaultProps = {
  isDragActive: false,
};

it('renders nothing is drag is activate', () => {
  const { container } = render(<EmptyTimeline isDragActive={true} />);

  expect(container).toBeEmpty();
});

it('renders message for desktop devices', () => {
  vi.mocked(useBrowserSupport).mockImplementationOnce(() => ({
    touchEvents: false,
    webkitOfflineAudioContext: true,
  }));

  const { getByText } = render(<EmptyTimeline {...defaultProps} />);
  const desktopMessage = getByText(
    'Drop files here, or use the upload button above',
  );

  expect(desktopMessage).toBeInTheDocument();
});

it('renders message for touch devices', () => {
  vi.mocked(useBrowserSupport).mockImplementationOnce(() => ({
    touchEvents: true,
    webkitOfflineAudioContext: true,
  }));

  const { getByText } = render(<EmptyTimeline {...defaultProps} />);
  const touchMessage = getByText('Use the upload button above');

  expect(touchMessage).toBeInTheDocument();
});
