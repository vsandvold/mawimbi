import React from 'react';
import { render } from '@testing-library/react';
import EmptyTimeline from '../EmptyTimeline';

const defaultProps = {
  isDragActive: false,
};

it('renders nothing is drag is activate', () => {
  const { container } = render(<EmptyTimeline isDragActive={true} />);

  expect(container).toBeEmpty();
});

// FIXME: this test passes only when running before the one below
it('renders message for desktop devices', () => {
  const { getByText } = render(<EmptyTimeline {...defaultProps} />);
  const desktopMessage = getByText(
    'Drop files here, or use the upload button above'
  );

  expect(desktopMessage).toBeInTheDocument();
});

it('renders message for touch devices', () => {
  const realOnTouchStart = window.ontouchstart;
  window.ontouchstart = undefined;

  const { getByText } = render(<EmptyTimeline {...defaultProps} />);
  const touchMessage = getByText('Use the upload button above');

  expect(touchMessage).toBeInTheDocument();

  window.ontouchstart = realOnTouchStart;
});
