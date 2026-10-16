export type PostieMood =
  | 'happy'
  | 'delivering'
  | 'sealed'
  | 'oops'
  | 'asleep'
  | 'waving'
  | 'searching'
  | 'writing';

interface PostieProps {
  mood: PostieMood;
  /** Accessible description, from the i18n dictionary (`postie.alt.<mood>`). */
  label: string;
  size?: number;
}

/**
 * Postie, the postman. Placeholder line art until an illustrator draws him; the moods, the cap,
 * the satchel and the bike are the brief. Colors come from the design tokens. The last three
 * moods are the empty-state poses: a wave hello, a look around, a pen over a blank letter.
 */
export function Postie({ mood, label, size = 160 }: PostieProps) {
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      stroke="var(--ink)"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Satchel */}
      <path
        d="M58 118 L58 158 Q58 166 66 166 L112 166 Q120 166 120 158 L120 118 Z"
        fill="var(--kraft)"
      />
      <path d="M58 126 L120 126" />
      <path d="M62 118 L128 60" />
      {/* Body */}
      <path
        d="M80 112 Q100 100 120 112 L128 166 L72 166 Z"
        fill="var(--navy)"
        stroke="var(--navy)"
      />
      {/* Head */}
      <circle cx="100" cy="76" r="30" fill="var(--paper-raised)" />
      {/* Cap */}
      <path d="M68 66 Q100 36 132 66 Z" fill="var(--navy)" stroke="var(--navy)" />
      <path d="M64 66 L140 66" stroke="var(--navy)" strokeWidth="6" />
      <circle cx="100" cy="54" r="4" fill="var(--yellow)" stroke="none" />
      {/* Eyes */}
      {mood === 'asleep' ? (
        <>
          <path d="M86 80 Q90 84 94 80" />
          <path d="M106 80 Q110 84 114 80" />
        </>
      ) : (
        <>
          <circle cx="90" cy="78" r="3" fill="var(--ink)" stroke="none" />
          <circle cx="110" cy="78" r="3" fill="var(--ink)" stroke="none" />
        </>
      )}
      {/* Mouth */}
      {mood === 'oops' ? (
        <ellipse cx="100" cy="92" rx="5" ry="7" fill="var(--ink)" stroke="none" />
      ) : mood === 'asleep' ? (
        <path d="M94 92 L106 92" />
      ) : (
        <path d="M90 90 Q100 98 110 90" />
      )}
      {/* Props by mood */}
      {mood === 'delivering' && (
        <>
          <path d="M126 120 L156 108 L160 128 L130 140 Z" fill="var(--paper-raised)" />
          <path d="M126 120 L143 130 L160 108" />
        </>
      )}
      {mood === 'sealed' && (
        <>
          <path d="M126 116 L164 116 L164 142 L126 142 Z" fill="var(--paper-raised)" />
          <path d="M126 116 L145 130 L164 116" />
          <circle cx="156" cy="138" r="8" fill="var(--red)" stroke="none" />
        </>
      )}
      {mood === 'oops' && (
        <>
          <path d="M132 160 L166 152 L170 168 L136 176 Z" fill="var(--paper-raised)" />
          <path d="M76 96 L64 84" />
          <path d="M124 96 L136 84" />
        </>
      )}
      {mood === 'asleep' && (
        <text
          x="140"
          y="60"
          fontFamily="var(--font-heading)"
          fontSize="18"
          fill="var(--ink-muted)"
          stroke="none"
        >
          z z
        </text>
      )}
      {mood === 'happy' && <path d="M126 120 Q140 112 150 124" />}
      {mood === 'waving' && (
        <>
          <path d="M126 118 L152 92" />
          <path d="M146 84 L152 92 L160 88" />
          <path d="M156 76 L162 70" />
          <path d="M166 86 L174 84" />
        </>
      )}
      {mood === 'searching' && (
        <>
          <path d="M126 118 L150 112 L156 94" />
          <circle cx="160" cy="86" r="10" fill="var(--paper-raised)" />
          <path d="M167 93 L176 102" strokeWidth="5" />
        </>
      )}
      {mood === 'writing' && (
        <>
          <path d="M126 122 L168 122 L168 150 L126 150 Z" fill="var(--paper-raised)" />
          <path d="M134 134 L152 134" stroke="var(--ink-muted)" />
          <path d="M134 142 L146 142" stroke="var(--ink-muted)" />
          <path d="M150 148 L166 118" stroke="var(--navy)" strokeWidth="5" />
        </>
      )}
    </svg>
  );
}
