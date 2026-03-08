import { useState } from 'react';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { type StoredProject } from '../../services/ProjectStorageService';
import { formatRelativeTime } from './formatRelativeTime';

type ProjectListProps = {
  projects: StoredProject[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
};

const ProjectList = ({
  projects,
  onOpen,
  onCreate,
  onDelete,
}: ProjectListProps) => {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div className="home__project-list">
      <div className="home__project-list-header">
        <span className="font-semibold">Projects</span>
        <Button onClick={onCreate}>New Project</Button>
      </div>
      <ul className="home__project-items">
        {projects.map((project) => (
          <li
            key={project.id}
            className="home__project-item"
            onClick={() => onOpen(project.id)}
          >
            <div className="home__project-meta">
              <span className="text-foreground">{project.title}</span>
              <div className="home__project-info">
                <span className="text-muted-foreground">
                  {project.tracks.length}{' '}
                  {project.tracks.length === 1 ? 'track' : 'tracks'}
                </span>
                <span className="text-muted-foreground">
                  {formatRelativeTime(project.updatedAt)}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(project.id);
              }}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the project and all its audio data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectList;
