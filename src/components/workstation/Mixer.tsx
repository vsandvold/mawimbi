import React from 'react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from 'react-beautiful-dnd';
import useProjectContext from '../project/useProjectContext';
import { MOVE_TRACK, Track } from '../project/useProjectState';
import Channel from './Channel';
import './Mixer.css';

type MixerProps = {
  mutedTracks: number[];
  tracks: Track[];
};

// TODO: refactor into HOC (DroppableMixer and DraggableChannel)
const Mixer = (mixerProps: MixerProps) => {
  console.log('Mixer render');

  const [projectDispatch] = useProjectContext();

  function onDragEnd(result: DropResult) {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    const fromIndex = result.source.index;
    const toIndex = result.destination.index;
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
  return (
    <>
      {tracks.map((track) => {
        const isMuted = mutedTracks.includes(track.id);
        return (
          <Draggable
            key={track.id}
            draggableId={track.id.toString()}
            index={track.index}
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
