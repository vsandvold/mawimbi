import React from 'react';
import { render } from '@testing-library/react';
import EmptyTimeline from '../EmptyTimeline';
import { useBrowserSupport } from '../../../browserSupport';

jest.mock('../../../browserSupport');

const defaultProps = {
  isDragActive: false,
};

it('renders nothing is drag is activate', () => {
  const { container } = render(<EmptyTimeline isDragActive={true} />);

  expect(container).toBeEmpty();
});

it('renders message for desktop devices', () => {
  (useBrowserSupport as jest.Mock).mockImplementationOnce(() => ({
    touchEvents: false,
  }));

  const { getByText } = render(<EmptyTimeline {...defaultProps} />);
  const desktopMessage = getByText(
    'Drop files here, or use the upload button above'
  );

  expect(desktopMessage).toBeInTheDocument();
});

it('renders message for touch devices', () => {
  (useBrowserSupport as jest.Mock).mockImplementationOnce(() => ({
    touchEvents: true,
  }));

  const { getByText } = render(<EmptyTimeline {...defaultProps} />);
  const touchMessage = getByText('Use the upload button above');

  expect(touchMessage).toBeInTheDocument();
});
