import { Ellipsis, PenLine, Redo, Undo, Upload } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import ControlSvg from '../../icons/control.svg?react';
import FloatingToolbar from './FloatingToolbar';
import { useBottomSheetDrag } from './useBottomSheetDrag';
import './Toolbar.css';
import './ToolbarBottomSheet.css';

// Height of the compact handle bar area
const HEADER_HEIGHT = 20;

// Content-area snap points (excludes header)
const ONE_ROW_HEIGHT = 48;
const TWO_ROW_HEIGHT = 96;

type ToolbarBottomSheetProps = {
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
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onToggleRecording: () => void;
  /** Height of the active bottom sheet (mixer or lyrics) to lift above */
  sheetOffset: number;
};

const ToolbarBottomSheet = (props: ToolbarBottomSheetProps) => {
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
    undo,
    redo,
    canUndo,
    canRedo,
    onToggleRecording,
    sheetOffset,
  } = props;

  const [contentHeight, setContentHeight] = useState(ONE_ROW_HEIGHT);
  const isDraggingRef = useRef(false);

  const snapPoints = useMemo(() => [ONE_ROW_HEIGHT, TWO_ROW_HEIGHT], []);

  const handleHeightChange = useCallback((height: number) => {
    setContentHeight(height);
  }, []);

  const { handlePointerDown, handlePointerMove, handlePointerUp } =
    useBottomSheetDrag({
      snapPoints,
      isDraggingRef,
      onHeightChange: handleHeightChange,
    });

  const totalHeight = contentHeight + HEADER_HEIGHT;
  const lyricsIconClass = classNames({ 'show-lyrics': isLyricsOpen });
  const mixerIconClass = classNames('custom-icon', {
    'show-mixer': isMixerOpen,
  });

  return (
    <div
      className="toolbar-dock"
      style={{
        bottom: sheetOffset,
        transition: isDraggingRef.current ? 'none' : undefined,
      }}
    >
      <FloatingToolbar
        isEmpty={isEmpty}
        onToggleRecording={onToggleRecording}
      />
      <div
        className="toolbar-sheet"
        style={{
          height: totalHeight,
          transition: isDraggingRef.current ? 'none' : undefined,
        }}
      >
        <div
          className="toolbar-sheet__header"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="bottom-sheet__handle-bar" />
        </div>
        <div
          className="toolbar-sheet__content"
          style={{ height: contentHeight }}
        >
          <div className="toolbar-sheet__row">
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
            <Button
              variant="ghost"
              size="icon-lg"
              className="button"
              title={isMixerOpen ? 'Hide mixer' : 'Show mixer'}
              onClick={onToggleMixer}
              disabled={isEmpty}
            >
              <span className={mixerIconClass}>
                <ControlSvg />
              </span>
            </Button>
          </div>
          <div className="toolbar-sheet__row">
            <UploadButton uploadFile={uploadFile} />
            <Button
              variant="ghost"
              size="icon-lg"
              className="button"
              aria-label="Undo"
              title="Undo"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="button"
              aria-label="Redo"
              title="Redo"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo />
            </Button>
            <OverflowMenu
              isFullscreen={isFullscreen}
              toggleFullscreen={toggleFullscreen}
              isLogOverlayOpen={isLogOverlayOpen}
              toggleLogOverlay={toggleLogOverlay}
            />
          </div>
        </div>
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

export default ToolbarBottomSheet;
