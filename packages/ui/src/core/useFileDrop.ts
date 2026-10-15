import { type DragEvent, useState } from 'react';

/**
 * Files dragged over an element: `dragging` while they hover it (for an overlay), `onFiles` when
 * they land. Anything that is not a file (text, a link) is left to the browser.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);

  function onDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  }

  function onDragLeave(event: DragEvent) {
    // Moving over a child fires a leave too: only leaving the element itself counts.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    onFiles([...event.dataTransfer.files]);
  }

  return { dragging, handlers: { onDragEnter: onDragOver, onDragOver, onDragLeave, onDrop } };
}
