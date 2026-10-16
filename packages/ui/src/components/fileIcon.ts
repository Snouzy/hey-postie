import { File, FileArchive, FileText, Film, Image, type LucideIcon, Music } from 'lucide-react';

/** The icon of a parcel, by its media type. */
export function fileIcon(mimeType: string): LucideIcon {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return FileText;
  if (/zip|compressed|tar|7z/.test(mimeType)) return FileArchive;
  return File;
}
