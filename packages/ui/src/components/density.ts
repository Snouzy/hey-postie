import type { Density } from '../core/settings';

/**
 * The room between letters for each density (Settings › Appearance): only spacing changes, never
 * a size. Bubbles of one run stay close enough for the toolbar to cover only the padding of the
 * bubble above (it sits 10px over its own, bubbles have 8px of padding).
 */
export const DENSITY_CLASSES: Record<
  Density,
  { bubbleRuns: string; bubbles: string; lineRuns: string; line: string }
> = {
  compact: { bubbleRuns: 'gap-1.5', bubbles: 'gap-[2px]', lineRuns: 'gap-1', line: 'py-0' },
  comfortable: { bubbleRuns: 'gap-3', bubbles: 'gap-1', lineRuns: 'gap-2', line: 'py-0.5' },
  spacious: { bubbleRuns: 'gap-5', bubbles: 'gap-2', lineRuns: 'gap-4', line: 'py-1.5' },
};
