import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import ProjectPageHeader from '../ProjectPageHeader';

const mockUploadFile = vi.fn();

const defaultProps = {
  title: 'Mawimbi No. 5',
  uploadFile: mockUploadFile,
  isFullscreen: false,
  toggleFullscreen: vi.fn(),
};

it('renders without crashing', () => {
  render(<ProjectPageHeader {...defaultProps} />);
});

it('renders project title', () => {
  const { getByText } = render(<ProjectPageHeader {...defaultProps} />);

  expect(getByText(defaultProps.title)).toBeInTheDocument();
});

it('navigates back from project page', () => {
  const { container } = render(<ProjectPageHeader {...defaultProps} />);

  const backButton = container.querySelector('[aria-label="Back"]');
  fireEvent.click(backButton as Element);

  const navigate = useNavigate();
  expect(navigate).toHaveBeenCalledWith(-1);
});

it('accepts multiple audio files for upload', () => {
  const { container } = render(<ProjectPageHeader {...defaultProps} />);

  const fileInput = container.querySelector('input[type="file"]');

  expect(fileInput).toBeInTheDocument();
  expect(fileInput).toHaveAttribute('accept', 'audio/*');
  expect(fileInput).toHaveAttribute('multiple', '');
});

it.skip('submits uploaded files', () => {
  // FIXME: this test is broken
  const { getByText } = render(<ProjectPageHeader {...defaultProps} />);

  const uploadButton = getByText('Upload files');
  fireEvent.click(uploadButton);

  expect(mockUploadFile).toHaveBeenCalledTimes(1);
});
