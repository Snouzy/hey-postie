import { useCallback, useState } from 'react';
import { type PaneSizes, readPaneSizes, writePaneSizes } from './settings';

/** The side columns' sizes at rest: read once from storage, written back on every change. */
export function usePaneSizes() {
  const [sizes, setSizes] = useState<PaneSizes>(readPaneSizes);

  // Stable: `Main` lists it among its keyboard listener's dependencies.
  const update = useCallback((patch: Partial<PaneSizes>) => {
    setSizes((current) => {
      const next = { ...current, ...patch };
      writePaneSizes(next);
      return next;
    });
  }, []);

  return { sizes, update };
}
