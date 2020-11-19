import React from 'react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from 'react-beautiful-dnd';
import { MOVE_TRACK, Track } from '../project/projectPageReducer';
import useProjectDispatch from '../project/useProjectDispatch';
import Channel from './Channel';
import './Mixer.css';

type MixerProps = {
  mutedTracks: number[];
  tracks: Track[];
};

// TODO: refactor into HOC (DroppableMixer and DraggableChannel)
const Mixer = (mixerProps: MixerProps) => {
  const { tracks } = mixerProps;
  const projectDispatch = useProjectDispatch();

  function onDragEnd(result: DropResult) {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    const offset = tracks.length - 1;
    const fromIndex = offset - result.source.index;
    const toIndex = offset - result.destination.index;
    projectDispatch([MOVE_TRACK, { fromIndex, toIndex }]);
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="channelList">
        {(provided) => (
          <div
            className="mixer"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            <ChannelList {...mixerProps} />
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

// TODO: add custom drag handle to Channel
const ChannelList = ({ mutedTracks, tracks }: MixerProps) => {
  const reversedTracks = tracks
    .slice() // Make a copy of the array, because reverse is done in place.
    .reverse();
  const offset = tracks.length - 1;
  return (
    <>
      {reversedTracks.map((track) => {
        const reversedIdx = offset - track.index;
        const isMuted = mutedTracks.includes(track.id);
        return (
          <Draggable
            key={track.id}
            draggableId={track.id.toString()}
            index={reversedIdx}
          >
            {(provided) => (
              <div
                className="mixer__channel"
                ref={provided.innerRef}
                {...provided.draggableProps}
              >
                <MemoizedChannel
                  isMuted={isMuted}
                  track={track}
                  {...provided.dragHandleProps}
                />
              </div>
            )}
          </Draggable>
        );
      })}
    </>
  );
};

const MemoizedChannel = React.memo(Channel);

export default Mixer;
