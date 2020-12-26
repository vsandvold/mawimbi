import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useHistory } from 'react-router-dom';
import ProjectPageHeader from '../ProjectPageHeader';

const defaultProps = {
  title: 'Mawimbi No. 5',
  uploadFile: jest.fn(),
  isFullscreen: false,
  toggleFullscreen: jest.fn(),
};

it('navigates back from project page', () => {
  const { container } = render(<ProjectPageHeader {...defaultProps} />);

  const backButton = container.querySelector('[role=button][aria-label=Back]');
  fireEvent.click(backButton as Element);

  const history = useHistory();
  expect(history.goBack).toHaveBeenCalledTimes(1);
});

it('accepts multiple audio files for upload', () => {
  const { container } = render(<ProjectPageHeader {...defaultProps} />);

  const fileInput = container.querySelector('input[type="file"]');

  expect(fileInput).toBeInTheDocument();
  expect(fileInput).toHaveAttribute('accept', 'audio/*');
  expect(fileInput).toHaveAttribute('multiple', '');
});
