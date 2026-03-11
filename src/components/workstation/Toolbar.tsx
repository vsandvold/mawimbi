import { Ellipsis, PenLine, Upload } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import classNames from 'classnames';
import ControlSvg from '../../icons/control.svg?react';
import './Toolbar.css';

type ToolbarProps = {
  isMixerOpen: boolean;
  isLyricsOpen: boolean;
  isEmpty: boolean;
  onToggleMixer: () => void;
  onToggleLyrics: () => void;
  uploadFile: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  isLogOverlayOpen: boolean;
  toggleLogOverlay: () => void;
};

const Toolbar = (props: ToolbarProps) => {
  const {
    isMixerOpen,
    isLyricsOpen,
    isEmpty,
    onToggleMixer,
    onToggleLyrics,
    uploadFile,
    isFullscreen,
    toggleFullscreen,
    isLogOverlayOpen,
    toggleLogOverlay,
  } = props;

  const lyricsIconClass = classNames({ 'show-lyrics': isLyricsOpen });
  const lyricsButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="button"
      title={isLyricsOpen ? 'Hide lyrics' : 'Show lyrics'}
      onClick={onToggleLyrics}
      disabled={isEmpty}
    >
      <PenLine className={lyricsIconClass} />
    </Button>
  );

  const mixerIconClass = classNames('custom-icon', {
    'show-mixer': isMixerOpen,
  });
  const mixerIcon = (
    <span className={mixerIconClass}>
      <ControlSvg />
    </span>
  );

  const mixerButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="button"
      title={isMixerOpen ? 'Hide mixer' : 'Show mixer'}
      onClick={onToggleMixer}
      disabled={isEmpty}
    >
      {mixerIcon}
    </Button>
  );

  return (
    <div className="toolbar">
      <div className="toolbar__button">{lyricsButton}</div>
      <div className="toolbar__button">{mixerButton}</div>
      <div className="toolbar__spacer" />
      <div className="toolbar__button">
        <UploadButton uploadFile={uploadFile} />
      </div>
      <div className="toolbar__button">
        <OverflowMenu
          isFullscreen={isFullscreen}
          toggleFullscreen={toggleFullscreen}
          isLogOverlayOpen={isLogOverlayOpen}
          toggleLogOverlay={toggleLogOverlay}
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
        size="icon-lg"
        className="button"
        title="Upload files"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload />
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
          size="icon-lg"
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

export default Toolbar;
