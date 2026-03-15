import { useState } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '../../shared/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../shared/ui/alert-dialog';
import { type StoredProject } from '../project/ProjectStorageService';
import { formatRelativeTime } from './formatRelativeTime';

type ProjectListProps = {
  projects: StoredProject[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

const ProjectList = ({ projects, onOpen, onDelete }: ProjectListProps) => {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  return (
    <div className="home__project-list">
      <ul className="home__project-items">
        {projects.map((project) => (
          <li
            key={project.id}
            className="home__project-item"
            onClick={() => onOpen(project.id)}
          >
            <div className="home__project-meta">
              <span className="home__project-title">{project.title}</span>
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
            <div className="home__project-actions">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(project.id);
                }}
                aria-label="Open project"
              >
                <FolderOpen size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(project.id);
                }}
                aria-label="Delete project"
              >
                <Trash2 size={16} />
              </Button>
            </div>
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
