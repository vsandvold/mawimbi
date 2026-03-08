import { ArrowLeft, Ellipsis, Redo, Undo, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import './ProjectPageHeader.css';

type ProjectPageHeaderProps = {
  title: string;
  uploadFile: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  isLogOverlayOpen: boolean;
  toggleLogOverlay: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  renameProject: (title: string) => void;
};

const ProjectPageHeader = (props: ProjectPageHeaderProps) => {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState(props.title);

  const openRenameModal = () => {
    setNewTitle(props.title);
    setIsRenameModalOpen(true);
  };

  const handleRename = () => {
    const trimmed = newTitle.trim();
    if (trimmed) {
      props.renameProject(trimmed);
    }
    setIsRenameModalOpen(false);
  };

  return (
    <div className="project-page-header">
      <Link to="/" className="back-link" aria-label="Back">
        <Button
          variant="ghost"
          size="icon"
          className="button back-button"
          tabIndex={-1}
        >
          <ArrowLeft />
        </Button>
      </Link>
      <h4 className="project-page-header__title" onClick={openRenameModal}>
        {props.title}
      </h4>
      <Dialog open={isRenameModalOpen} onOpenChange={setIsRenameModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRenameModalOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleRename}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="project-page-header__extra">
        <Button
          variant="ghost"
          size="icon"
          className="button"
          aria-label="Undo"
          disabled={!props.canUndo}
          onClick={props.undo}
        >
          <Undo />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="button"
          aria-label="Redo"
          disabled={!props.canRedo}
          onClick={props.redo}
        >
          <Redo />
        </Button>
        <UploadButton uploadFile={props.uploadFile} />
        <OverflowMenu
          isFullscreen={props.isFullscreen}
          toggleFullscreen={props.toggleFullscreen}
          isLogOverlayOpen={props.isLogOverlayOpen}
          toggleLogOverlay={props.toggleLogOverlay}
        />
      </div>
    </div>
  );
};

type UploadButtonProps = {
  uploadFile: (file: File) => void;
};

const UploadButton = (props: UploadButtonProps) => {
  const { uploadFile } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of files) {
        uploadFile(file);
      }
    }
    // Reset so the same file can be uploaded again
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="ghost"
        className="button"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload />
        <span className="hidden-lt768">Upload files</span>
      </Button>
    </>
  );
};

type OverflowMenuProps = {
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  isLogOverlayOpen: boolean;
  toggleLogOverlay: () => void;
};

const OverflowMenu = (props: OverflowMenuProps) => {
  const { isFullscreen, toggleFullscreen, isLogOverlayOpen, toggleLogOverlay } =
    props;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="button overflow-button"
          aria-label="More"
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => toggleFullscreen()}>
          {isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toggleLogOverlay}>
          {isLogOverlayOpen ? 'Hide Logs' : 'View Logs'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProjectPageHeader;
