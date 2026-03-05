import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import ProjectPageHeader from '../ProjectPageHeader';

const mockUploadFile = vi.fn();
const mockRenameProject = vi.fn();

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
  renameProject: mockRenameProject,
};

const renderHeader = (props = {}) =>
  render(
    <MemoryRouter>
      <ProjectPageHeader {...defaultProps} {...props} />
    </MemoryRouter>,
  );

it('renders without crashing', () => {
  renderHeader();
});

it('renders project title', () => {
  const { getByText } = renderHeader();

  expect(getByText(defaultProps.title)).toBeInTheDocument();
});

it('back button links to home page', () => {
  const { container } = renderHeader();

  const backLink = container.querySelector('a[href="/"]');

  expect(backLink).toBeInTheDocument();
  expect(backLink).toHaveAttribute('aria-label', 'Back');
});

it('accepts multiple audio files for upload', () => {
  const { container } = renderHeader();

  const fileInput = container.querySelector('input[type="file"]');

  expect(fileInput).toBeInTheDocument();
  expect(fileInput).toHaveAttribute('accept', 'audio/*');
  expect(fileInput).toHaveAttribute('multiple', '');
});

it('renders undo and redo buttons', () => {
  const { container } = renderHeader();

  const undoButton = container.querySelector('[aria-label="Undo"]');
  const redoButton = container.querySelector('[aria-label="Redo"]');

  expect(undoButton).toBeInTheDocument();
  expect(redoButton).toBeInTheDocument();
});

it('disables undo button when canUndo is false', () => {
  const { container } = renderHeader({ canUndo: false });

  const undoButton = container.querySelector('[aria-label="Undo"]');
  expect(undoButton).toBeDisabled();
});

it('disables redo button when canRedo is false', () => {
  const { container } = renderHeader({ canRedo: false });

  const redoButton = container.querySelector('[aria-label="Redo"]');
  expect(redoButton).toBeDisabled();
});

it('calls undo when undo button is clicked', () => {
  const { container } = renderHeader({ canUndo: true });

  const undoButton = container.querySelector('[aria-label="Undo"]');
  fireEvent.click(undoButton as Element);

  expect(mockUndo).toHaveBeenCalledTimes(1);
});

it('calls redo when redo button is clicked', () => {
  const { container } = renderHeader({ canRedo: true });

  const redoButton = container.querySelector('[aria-label="Redo"]');
  fireEvent.click(redoButton as Element);

  expect(mockRedo).toHaveBeenCalledTimes(1);
});

it('renders undo and redo buttons before the upload button', () => {
  const { container } = renderHeader();

  const extra = container.querySelector('.project-page-header__extra');
  const buttons = extra?.querySelectorAll('button');

  // Undo, Redo, Upload button (inside Upload component), Overflow menu
  expect(buttons).toBeDefined();
  expect(buttons![0]).toHaveAttribute('aria-label', 'Undo');
  expect(buttons![1]).toHaveAttribute('aria-label', 'Redo');
});

it('opens rename modal when title is clicked', () => {
  renderHeader();

  const title = screen.getByText(defaultProps.title);
  fireEvent.click(title);

  expect(screen.getByText('Rename project')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue(defaultProps.title);
});

it('calls renameProject with new title when Update is clicked', () => {
  renderHeader();

  fireEvent.click(screen.getByText(defaultProps.title));

  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'New Name' } });

  const modal = screen.getByRole('dialog');
  const updateButton = within(modal).getByText('Update');
  fireEvent.click(updateButton);

  expect(mockRenameProject).toHaveBeenCalledWith('New Name');
});

it('does not rename when title is empty', () => {
  renderHeader();

  fireEvent.click(screen.getByText(defaultProps.title));

  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '   ' } });

  const modal = screen.getByRole('dialog');
  const updateButton = within(modal).getByText('Update');
  fireEvent.click(updateButton);

  expect(mockRenameProject).not.toHaveBeenCalled();
});

it('closes rename modal when Cancel is clicked', () => {
  renderHeader();

  fireEvent.click(screen.getByText(defaultProps.title));
  expect(screen.getByText('Rename project')).toBeInTheDocument();

  const modal = screen.getByRole('dialog');
  const cancelButton = within(modal).getByText('Cancel');
  fireEvent.click(cancelButton);

  expect(mockRenameProject).not.toHaveBeenCalled();
});
