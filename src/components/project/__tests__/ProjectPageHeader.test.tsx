import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { vi } from 'vitest';
import ProjectPageHeader from '../ProjectPageHeader';

const mockUploadFile = vi.fn();

const mockUndo = vi.fn();
const mockRedo = vi.fn();

const defaultProps = {
  title: 'Mawimbi No. 5',
  uploadFile: mockUploadFile,
  isFullscreen: false,
  toggleFullscreen: vi.fn(),
  undo: mockUndo,
  redo: mockRedo,
  canUndo: false,
  canRedo: false,
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

it('renders undo and redo buttons', () => {
  const { container } = render(<ProjectPageHeader {...defaultProps} />);

  const undoButton = container.querySelector('[aria-label="Undo"]');
  const redoButton = container.querySelector('[aria-label="Redo"]');

  expect(undoButton).toBeInTheDocument();
  expect(redoButton).toBeInTheDocument();
});

it('disables undo button when canUndo is false', () => {
  const { container } = render(
    <ProjectPageHeader {...defaultProps} canUndo={false} />,
  );

  const undoButton = container.querySelector('[aria-label="Undo"]');
  expect(undoButton).toBeDisabled();
});

it('disables redo button when canRedo is false', () => {
  const { container } = render(
    <ProjectPageHeader {...defaultProps} canRedo={false} />,
  );

  const redoButton = container.querySelector('[aria-label="Redo"]');
  expect(redoButton).toBeDisabled();
});

it('calls undo when undo button is clicked', () => {
  const { container } = render(
    <ProjectPageHeader {...defaultProps} canUndo={true} />,
  );

  const undoButton = container.querySelector('[aria-label="Undo"]');
  fireEvent.click(undoButton as Element);

  expect(mockUndo).toHaveBeenCalledTimes(1);
});

it('calls redo when redo button is clicked', () => {
  const { container } = render(
    <ProjectPageHeader {...defaultProps} canRedo={true} />,
  );

  const redoButton = container.querySelector('[aria-label="Redo"]');
  fireEvent.click(redoButton as Element);

  expect(mockRedo).toHaveBeenCalledTimes(1);
});

it('renders undo and redo buttons before the upload button', () => {
  const { container } = render(<ProjectPageHeader {...defaultProps} />);

  const extra = container.querySelector('.project-page-header__extra');
  const buttons = extra?.querySelectorAll('button');

  // Undo, Redo, Upload button (inside Upload component), Overflow menu
  expect(buttons).toBeDefined();
  expect(buttons![0]).toHaveAttribute('aria-label', 'Undo');
  expect(buttons![1]).toHaveAttribute('aria-label', 'Redo');
});
