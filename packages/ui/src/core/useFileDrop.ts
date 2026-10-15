import { type DragEvent, useRef, useState } from 'react';

/**
 * Files dragged over an element: `dragging` while they hover it (for an overlay), `onFiles` when
 * they land. Anything that is not a file (text, a link) is left to the browser, and so is
 * everything while `enabled` is false (a hall the user is not in).
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  // Enter and leave fire for every child crossed: only the balance says whether we are still in.
  const depth = useRef(0);

  function carriesFiles(event: DragEvent): boolean {
    return enabled && event.dataTransfer.types.includes('Files');
  }

  function onDragEnter(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent) {
    if (carriesFiles(event)) event.preventDefault();
  }

  function onDragLeave(event: DragEvent) {
    if (!carriesFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    onFiles([...event.dataTransfer.files]);
  }

  return { dragging, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
