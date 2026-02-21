import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';
import { MOVE_TRACK, Track, TrackId } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import Channel from './Channel';
import './Mixer.css';

type MixerProps = {
  mutedTracks: TrackId[];
  tracks: Track[];
};

const Mixer = (mixerProps: MixerProps) => {
  const { tracks } = mixerProps;
  const projectDispatch = useProjectDispatch();
  const sensors = useSensors(useSensor(PointerSensor));

  const reversedTracks = tracks.slice().reverse();
  const reversedIds = reversedTracks.map((t) => t.trackId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const offset = tracks.length - 1;
    const oldRevIdx = reversedIds.indexOf(active.id as TrackId);
    const newRevIdx = reversedIds.indexOf(over.id as TrackId);
    const fromIndex = offset - oldRevIdx;
    const toIndex = offset - newRevIdx;
    projectDispatch([MOVE_TRACK, { fromIndex, toIndex }]);
  }

  return (
    // closestCenter is required so the dragged strip follows the pointer
    // immediately. The default rectIntersection returns no `over` until the
    // active rect overlaps another channel (~21 px), which prevents
    // useSortable from applying any transform to the active item — making it
    // appear frozen until it suddenly jumps into position.
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
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
              isMuted={mixerProps.mutedTracks.includes(track.trackId)}
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
};

const SortableChannelItem = ({ track, isMuted }: SortableChannelItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: track.trackId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div className="mixer__channel" ref={setNodeRef} style={style}>
      <MemoizedChannel
        isMuted={isMuted}
        track={track}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
};

const MemoizedChannel = React.memo(Channel);

export default Mixer;
