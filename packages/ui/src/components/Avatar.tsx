/** A round stamp: the picture, or the initials on a soft wash of the person's colour (`--tone`). */
const AVATAR =
  'inline-flex shrink-0 items-center justify-center rounded-[50%] bg-[color-mix(in_srgb,var(--tone)_24%,var(--paper-raised))] object-cover leading-none font-bold tracking-[0.02em] text-(--tone) select-none';

/** `--tone` from the `data-tone` attribute, which `toneOf` picks from the JID. */
const TONES_BY_DATA =
  'data-[tone=navy]:[--tone:var(--navy)] data-[tone=kraft]:[--tone:var(--kraft-ink)] data-[tone=success]:[--tone:var(--success)] data-[tone=warning]:[--tone:var(--warning)] data-[tone=red]:[--tone:var(--red)]';

interface AvatarProps {
  /** The name shown next to the avatar; gives the initials when there is no picture. */
  name: string;
  /** Picks the colour of the initials, so the same person keeps the same colour everywhere. */
  jid: string;
  avatarUrl?: string | undefined;
  /** Diameter in pixels. */
  size?: number;
}

const TONES = ['navy', 'kraft', 'success', 'warning', 'red'] as const;

/**
 * A round picture when the server has one, otherwise the initials on a colour derived from the
 * JID. Decorative: the name is always written next to it, so `alt` stays empty.
 */
export function Avatar({ name, jid, avatarUrl, size = 32 }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (avatarUrl) {
    return <img className={AVATAR} src={avatarUrl} alt="" style={style} />;
  }
  return (
    <span
      className={`${AVATAR} ${TONES_BY_DATA}`}
      data-tone={toneOf(jid)}
      style={style}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

/** The first letter of the first two words; a JID-like name gives its first letter only. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => [...word][0] ?? '');
  return letters.join('').toUpperCase();
}

export function toneOf(jid: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of jid) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return TONES[hash % TONES.length] ?? 'navy';
}
