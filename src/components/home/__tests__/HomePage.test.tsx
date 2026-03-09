import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { beforeAll, vi } from 'vitest';
import type { StoredProject } from '../../../services/ProjectStorageService';
import HomePage from '../HomePage';

// matchMedia is used by responsive components
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const { mockListProjects, mockDeleteProject, mockGetStorageEstimate } =
  vi.hoisted(() => ({
    mockListProjects: vi.fn(),
    mockDeleteProject: vi.fn(),
    mockGetStorageEstimate: vi.fn(),
  }));

vi.mock('../../../services/ProjectStorageService', () => ({
  listProjects: mockListProjects,
  deleteProject: mockDeleteProject,
  getStorageEstimate: mockGetStorageEstimate,
}));

const PROJECT_A: StoredProject = {
  id: 'project-a',
  title: 'My Song',
  tracks: [
    {
      trackId: 'track-1',
      color: { r: 77, g: 238, b: 234 },
      fileName: 'drums.wav',
      index: 0,
    },
    {
      trackId: 'track-2',
      color: { r: 116, g: 238, b: 21 },
      fileName: 'bass.wav',
      index: 1,
    },
  ],
  nextColorId: 2,
  nextIndex: 2,
  createdAt: Date.now() - 3_600_000,
  updatedAt: Date.now() - 60_000,
};

const PROJECT_B: StoredProject = {
  id: 'project-b',
  title: 'Demo',
  tracks: [],
  nextColorId: 0,
  nextIndex: 0,
  createdAt: Date.now() - 86_400_000,
  updatedAt: Date.now() - 86_400_000,
};

function setupMocks(
  projects: StoredProject[] = [],
  estimate: StorageEstimate = { usage: 1024, quota: 1073741824 },
) {
  mockListProjects.mockResolvedValue(projects);
  mockDeleteProject.mockResolvedValue(undefined);
  mockGetStorageEstimate.mockResolvedValue(estimate);
}

it('shows empty state when no projects exist', async () => {
  setupMocks([]);
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('Mawimbi')).toBeInTheDocument();
  });
  expect(
    screen.getByText('No projects yet. Create one to get started.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Create Project')).toBeInTheDocument();
});

it('renders project list with track count and relative time', async () => {
  setupMocks([PROJECT_A, PROJECT_B]);
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('My Song')).toBeInTheDocument();
  });
  expect(screen.getByText('Demo')).toBeInTheDocument();
  expect(screen.getByText('2 tracks')).toBeInTheDocument();
  expect(screen.getByText('0 tracks')).toBeInTheDocument();
  expect(screen.getByText('1 minute ago')).toBeInTheDocument();
  expect(screen.getByText('1 day ago')).toBeInTheDocument();
});

it('navigates to new project with UUID on create', async () => {
  setupMocks([PROJECT_A]);
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByLabelText('New project')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByLabelText('New project'));

  const navigate = useNavigate();
  expect(navigate).toHaveBeenCalledWith(
    expect.stringMatching(
      /^\/project\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    ),
  );
});

it('navigates to new project from empty state', async () => {
  setupMocks([]);
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('Create Project')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByText('Create Project'));

  const navigate = useNavigate();
  expect(navigate).toHaveBeenCalledWith(
    expect.stringMatching(
      /^\/project\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    ),
  );
});

it('opens a project on click', async () => {
  setupMocks([PROJECT_A]);
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('My Song')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByText('My Song'));

  const navigate = useNavigate();
  expect(navigate).toHaveBeenCalledWith('/project/project-a');
});

it('deletes a project after confirmation', async () => {
  setupMocks([PROJECT_A, PROJECT_B]);
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('My Song')).toBeInTheDocument();
  });

  const deleteButtons = screen.getAllByLabelText('Delete project');
  fireEvent.click(deleteButtons[0]);

  // AlertDialog should appear
  await waitFor(() => {
    expect(screen.getByText('Delete project?')).toBeInTheDocument();
  });

  // Confirm via the destructive action button in the AlertDialog
  const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
  const confirmButton = confirmButtons.find(
    (btn) => btn.closest('[data-slot="alert-dialog-content"]') !== null,
  )!;
  fireEvent.click(confirmButton);

  await waitFor(() => {
    expect(mockDeleteProject).toHaveBeenCalledWith('project-a');
  });

  // Project should be removed from the list
  await waitFor(() => {
    expect(screen.queryByText('My Song')).not.toBeInTheDocument();
  });
});

it('displays storage usage when projects exist', async () => {
  setupMocks([PROJECT_A], { usage: 47185920, quota: 2147483648 });
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('Using 45.0 MB of 2.0 GB')).toBeInTheDocument();
  });
});

it('shows empty state when loading projects fails', async () => {
  mockListProjects.mockRejectedValue(new Error('IndexedDB unavailable'));
  mockGetStorageEstimate.mockResolvedValue({
    usage: undefined,
    quota: undefined,
  });
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('Mawimbi')).toBeInTheDocument();
  });
  expect(screen.getByText('Create Project')).toBeInTheDocument();
});

it('hides storage usage when no projects exist', async () => {
  setupMocks([], { usage: 0, quota: 2147483648 });
  render(<HomePage />);

  await waitFor(() => {
    expect(screen.getByText('Create Project')).toBeInTheDocument();
  });

  expect(screen.queryByText(/Using/)).not.toBeInTheDocument();
});
