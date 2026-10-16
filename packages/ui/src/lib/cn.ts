import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Our text sizes are arbitrary pixel values (`text-[13px]`) that set the size only, so a size
 * must not drop the line height of the classes it is merged with (by default it would).
 */
const merge = extendTailwindMerge({
  override: { conflictingClassGroups: { 'font-size': [] } },
});

/** Joins class names; when two utilities clash (`p-2` then `p-4`), the last one wins. */
export function cn(...classes: ClassValue[]): string {
  return merge(clsx(classes));
}
