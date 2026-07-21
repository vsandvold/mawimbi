import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTrackService } from '../tracks/useTrackService';
// Command functions, not signals — module-scope import keeps the drag
// effect's dependencies compile-time stable and avoids building the full
// bridge-hook object on every row render during a drag.
import {
  focusTrack,
  setDragTargetTrackId,
  unfocusTrack,
} from '../tracks/focusSignals';
import { type Track, type TrackId } from '../tracks/types';
import { MOVE_TRACK } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import Channel from './Channel';
import './Mixer.css';

type MixerProps = {
  tracks: Track[];
};

const Mixer = ({ tracks }: MixerProps) => {
  const { mutedTracks } = useTrackService();
  const projectDispatch = useProjectDispatch();
  const sensors = useSensors(useSensor(PointerSensor));
  const [openDropdownId, setOpenDropdownId] = useState<TrackId | null>(null);

  const reversedTracks = tracks.slice().reverse();
  const reversedIds = reversedTracks.map((t) => t.trackId);

  const handleDropdownOpenChange = useCallback(
    (trackId: TrackId, open: boolean) => {
      setOpenDropdownId((prev) => {
        if (open) return trackId;
        // Only close if this track's dropdown is the one currently open.
        // Prevents a closing dropdown from overriding a newly opened one.
        return prev === trackId ? null : prev;
      });
    },
    [],
  );

  // Live preview of the pending swap: as the dragged channel crosses over
  // another channel's row (dnd-kit's onDragOver fires continuously, not
  // just at drop), that other track gets an intermediate highlight in the
  // timeline so the "who would this swap with" preview reads as live
  // motion, not a single static lift for the whole gesture.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDragTargetTrackId(null);
      return;
    }
    setDragTargetTrackId(over.id as TrackId);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragTargetTrackId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const offset = tracks.length - 1;
    const oldRevIdx = reversedIds.indexOf(active.id as TrackId);
    const newRevIdx = reversedIds.indexOf(over.id as TrackId);
    const fromIndex = offset - oldRevIdx;
    const toIndex = offset - newRevIdx;
    projectDispatch([MOVE_TRACK, { fromIndex, toIndex }]);
  }

  function handleDragCancel() {
    setDragTargetTrackId(null);
  }

  // Belt-and-suspenders: if the whole mixer sheet unmounts mid-drag (e.g.
  // closed via a keyboard-activated toggle behind it), no dnd-kit callback
  // fires at all — clear the target directly so it can't outlive this
  // component. SortableChannelItem's own effect covers the dragged
  // track's focus the same way.
  useEffect(() => {
    return () => setDragTargetTrackId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={reversedIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="mixer">
          {reversedTracks.map((track) => (
            <SortableChannelItem
              key={track.trackId}
              track={track}
              isMuted={mutedTracks.includes(track.trackId)}
              isInstrumentDropdownOpen={openDropdownId === track.trackId}
              onInstrumentDropdownOpenChange={handleDropdownOpenChange}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

type SortableChannelItemProps = {
  track: Track;
  isMuted: boolean;
  isInstrumentDropdownOpen: boolean;
  onInstrumentDropdownOpenChange: (trackId: TrackId, open: boolean) => void;
};

const SortableChannelItem = ({
  track,
  isMuted,
  isInstrumentDropdownOpen,
  onInstrumentDropdownOpenChange,
}: SortableChannelItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.trackId });

  // Reorder-dragging lifts the dragged track in the timeline, same as
  // touching its fader. An effect on isDragging — not DndContext's
  // onDragStart/onDragEnd — because only the effect's cleanup also fires
  // when the item (or the whole mixer sheet) unmounts mid-drag; context
  // callbacks would leave the focus stuck in that case.
  useEffect(() => {
    if (!isDragging) return;
    focusTrack(track.trackId);
    return () => unfocusTrack(track.trackId);
  }, [isDragging, track.trackId]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleDropdownOpenChange = useCallback(
    (open: boolean) => {
      onInstrumentDropdownOpenChange(track.trackId, open);
    },
    // onInstrumentDropdownOpenChange is stable (useCallback in Mixer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track.trackId],
  );

  return (
    <div className="mixer__channel" ref={setNodeRef} style={style}>
      <Channel
        isMuted={isMuted}
        isInstrumentDropdownOpen={isInstrumentDropdownOpen}
        onInstrumentDropdownOpenChange={handleDropdownOpenChange}
        track={track}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
};

export default Mixer;
