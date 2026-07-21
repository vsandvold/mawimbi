import {
  Ellipsis,
  PenLine,
  Redo,
  SlidersHorizontal,
  Undo,
  Upload,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Button } from '../../shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../shared/ui/dropdown-menu';
import ControlSvg from '../../icons/control.svg?react';
import FloatingToolbar from './FloatingToolbar';
import { useTuningAvailable } from './scrubber/useTuningActivation';
import { useTuningOverlay } from './scrubber/useTuningOverlay';
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
  isEffectsOpen: boolean;
  isRecordingOpen: boolean;
  /** True while counting in or actively recording — every sheet toggle
   *  stays inert so the recording drawer is the only reachable sheet. */
  isRecordingLocked: boolean;
  isEmpty: boolean;
  onToggleMixer: () => void;
  onToggleLyrics: () => void;
  onToggleEffects: () => void;
  uploadFile: (file: File) => void;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  isLogOverlayOpen: boolean;
  toggleLogOverlay: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onRewind: () => void;
  onToggleRecording: () => void;
  /** Height of the active bottom sheet (mixer or lyrics) to lift above */
  sheetOffset: number;
};

const ToolbarBottomSheet = (props: ToolbarBottomSheetProps) => {
  const {
    isMixerOpen,
    isLyricsOpen,
    isEffectsOpen,
    isRecordingOpen,
    isRecordingLocked,
    isEmpty,
    onToggleMixer,
    onToggleLyrics,
    onToggleEffects,
    uploadFile,
    isFullscreen,
    toggleFullscreen,
    isLogOverlayOpen,
    toggleLogOverlay,
    undo,
    redo,
    canUndo,
    canRedo,
    onRewind,
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

  const isContentSheetOpen = sheetOffset > 0;
  const totalHeight = isContentSheetOpen ? 0 : contentHeight + HEADER_HEIGHT;
  const lyricsIconClass = classNames({ 'show-lyrics': isLyricsOpen });
  const mixerIconClass = classNames('custom-icon', {
    'show-mixer': isMixerOpen,
  });
  const effectsIconClass = classNames({ 'show-effects': isEffectsOpen });

  return (
    <div
      className="toolbar-dock"
      style={
        {
          '--offset': `${sheetOffset}px`,
          transition: isDraggingRef.current ? 'none' : undefined,
        } as React.CSSProperties
      }
    >
      <FloatingToolbar
        isEmpty={isEmpty}
        isRecordingOpen={isRecordingOpen}
        isRecordingLocked={isRecordingLocked}
        onRewind={onRewind}
        onToggleRecording={onToggleRecording}
      />
      <div
        className={classNames('toolbar-sheet', {
          'toolbar-sheet--hidden': isContentSheetOpen,
        })}
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
              disabled={isEmpty || isRecordingLocked}
            >
              <PenLine className={lyricsIconClass} />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="button"
              title={isMixerOpen ? 'Hide mixer' : 'Show mixer'}
              onClick={onToggleMixer}
              disabled={isEmpty || isRecordingLocked}
            >
              <span className={mixerIconClass}>
                <ControlSvg />
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="button"
              title={isEffectsOpen ? 'Hide effects' : 'Show effects'}
              onClick={onToggleEffects}
              disabled={isEmpty || isRecordingLocked}
            >
              <SlidersHorizontal className={effectsIconClass} />
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
              isEmpty={isEmpty}
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
  isEmpty: boolean;
  isFullscreen: boolean;
  toggleFullscreen: (state?: boolean) => void;
  isLogOverlayOpen: boolean;
  toggleLogOverlay: () => void;
};

const OverflowMenu = (props: OverflowMenuProps) => {
  const {
    isEmpty,
    isFullscreen,
    toggleFullscreen,
    isLogOverlayOpen,
    toggleLogOverlay,
  } = props;
  const isTuningAvailable = useTuningAvailable();
  const { isOpen: isTuningOpen, toggle: toggleTuning } = useTuningOverlay();

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
        {isTuningAvailable && (
          // Disabled when empty: TuningOverlay only renders inside Scrubber,
          // which Workstation unmounts when there's no timeline to show. The
          // disabled prop alone only fades the item via CSS, so the click is
          // guarded too — toggling the signal with nothing mounted to
          // display it would silently no-op now and pop the overlay open
          // unexpectedly later.
          <DropdownMenuItem
            disabled={isEmpty}
            onClick={() => !isEmpty && toggleTuning()}
          >
            {isTuningOpen ? 'Hide Runway Tuning' : 'Show Runway Tuning'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ToolbarBottomSheet;
