import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useHistory } from 'react-router-dom';
import ProjectPageHeader from '../ProjectPageHeader';

const mockUploadFile = jest.fn();

const defaultProps = {
  title: 'Mawimbi No. 5',
  uploadFile: mockUploadFile,
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

xit('submits uploaded files', () => {
  // FIXME: this test is broken
  const { getByText } = render(<ProjectPageHeader {...defaultProps} />);

  const uploadButton = getByText('Upload files');
  fireEvent.click(uploadButton);

  expect(mockUploadFile).toHaveBeenCalledTimes(1);
});
