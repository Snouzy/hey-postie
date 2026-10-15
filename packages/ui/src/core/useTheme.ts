import { useLayoutEffect, useState } from 'react';
import { readTheme, type Theme, writeTheme } from './settings';

/**
 * The theme the user picked, applied as `data-theme` on `<html>` (removed for "system": the
 * tokens then follow `prefers-color-scheme`). The stored value is read synchronously on the first
 * render and applied in a layout effect, before the browser paints: no flash of the wrong theme.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useLayoutEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  function setTheme(next: Theme) {
    writeTheme(next);
    setThemeState(next);
  }

  return [theme, setTheme];
}
