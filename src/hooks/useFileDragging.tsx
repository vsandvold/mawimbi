import { useEffect, useRef, useState } from 'react';

const useFileDragging = () => {
  const [isFileDragging, setIsFileDragging] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current++;
    if (
      event.dataTransfer &&
      event.dataTransfer.items &&
      event.dataTransfer.items.length > 0
    ) {
      setIsFileDragging(true);
    }
  };

  const onDragLeave = (event: DragEvent) => {
    // FIXME: does not trigger correctly when drag leaves window
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsFileDragging(false);
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsFileDragging(false);
  };

  return isFileDragging;
};

export default useFileDragging;
