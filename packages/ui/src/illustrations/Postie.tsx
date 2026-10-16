export type PostieMood =
  | 'happy'
  | 'waving'
  | 'delivering'
  | 'sealed'
  | 'writing'
  | 'parcel'
  | 'thinking'
  | 'searching'
  | 'celebrating'
  | 'oops'
  | 'asleep';

interface PostieProps {
  mood: PostieMood;
  /** Accessible description, from the i18n dictionary (`postie.alt.<mood>`). */
  label: string;
  size?: number;
}

type Arm = 'down' | 'raised' | 'chest' | 'chin';
type Eyes = 'open' | 'aside' | 'down' | 'up' | 'closed' | 'joy';
type Mouth = 'smile' | 'flat' | 'o' | 'open';
type Prop = 'none' | 'letter' | 'sealed' | 'note' | 'parcel';

/** What each expression changes: the arm and what it holds, the eyes, the mouth, the head's tilt. */
const POSES: Record<PostieMood, { arm: Arm; prop: Prop; eyes: Eyes; mouth: Mouth; tilt: number }> =
  {
    happy: { arm: 'down', prop: 'none', eyes: 'open', mouth: 'smile', tilt: 0 },
    waving: { arm: 'raised', prop: 'none', eyes: 'open', mouth: 'smile', tilt: 0 },
    delivering: { arm: 'raised', prop: 'letter', eyes: 'open', mouth: 'smile', tilt: 0 },
    sealed: { arm: 'raised', prop: 'sealed', eyes: 'open', mouth: 'smile', tilt: 0 },
    writing: { arm: 'chest', prop: 'note', eyes: 'down', mouth: 'smile', tilt: 0 },
    parcel: { arm: 'chest', prop: 'parcel', eyes: 'open', mouth: 'smile', tilt: 0 },
    thinking: { arm: 'chin', prop: 'none', eyes: 'up', mouth: 'flat', tilt: -4 },
    searching: { arm: 'down', prop: 'none', eyes: 'aside', mouth: 'flat', tilt: 0 },
    celebrating: { arm: 'raised', prop: 'none', eyes: 'joy', mouth: 'open', tilt: 4 },
    oops: { arm: 'down', prop: 'none', eyes: 'open', mouth: 'o', tilt: 8 },
    asleep: { arm: 'down', prop: 'none', eyes: 'closed', mouth: 'flat', tilt: -10 },
  };

const SKIN = 'var(--postie-skin)';
const UNIFORM = 'var(--postie-uniform)';
const BAND = 'var(--postie-band)';
const LINE = 'var(--postie-line)';

/**
 * Postie, the postman, in ligne claire (decided by the author on 2026-10-16): one silhouette with
 * the head in three-quarter view under a kepi, one 2.4px line, nothing floating (the arm grows
 * from the shoulder, the hand covers the sleeve, what he holds is in his hand). His colours are
 * the `--postie-*` tokens, the same in both themes. An expression only changes the arm, the eyes,
 * the mouth and the tilt of the head; see wiki/product/brand.md, "Postie".
 */
export function Postie({ mood, label, size = 160 }: PostieProps) {
  const pose = POSES[mood];
  const head = `rotate(${pose.tilt} 100 120)`;
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 200 200">
      <g stroke={LINE} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        {pose.arm === 'raised' && (
          <path
            d="M122 150 L154 104 Q158 98 165 101 L174 108 Q178 113 174 118 L146 166 Z"
            fill={UNIFORM}
          />
        )}
        {pose.prop === 'letter' && <Letter />}
        {pose.prop === 'sealed' && <Letter sealed />}
        {pose.arm === 'raised' && <circle cx="167" cy="98" r="11" fill={SKIN} />}
        <path
          d="M42 200 C42 160 60 138 92 134 L108 134 C140 138 156 160 156 200 Z"
          fill={UNIFORM}
        />
        <path
          d="M60 148 L72 141 L152 192 L154 200 L140 200 Z"
          fill="var(--postie-kraft)"
          strokeWidth="2"
        />
        <path d="M90 118 L90 134 L100 146 L110 134 L110 118 Z" fill={SKIN} />
        {pose.prop === 'note' && <Note />}
        {pose.prop === 'parcel' && <Parcel />}
        {pose.arm === 'chest' && <circle cx="134" cy="182" r="10" fill={SKIN} />}
        <g transform={head}>
          <circle cx="131" cy="94" r="7" fill={SKIN} />
          <circle cx="100" cy="92" r="33" fill={SKIN} />
          <Kepi />
        </g>
        {pose.arm === 'chin' && (
          <>
            <path
              d="M138 198 L110 138 Q108 128 117 126 Q126 125 129 133 L160 192 Z"
              fill={UNIFORM}
            />
            <circle cx="114" cy="126" r="10" fill={SKIN} />
          </>
        )}
      </g>
      <g transform={head}>
        <Face eyes={pose.eyes} mouth={pose.mouth} />
      </g>
    </svg>
  );
}

/** A short cylinder with its flat top, a dark band with the badge, a short visor above the eyes. */
function Kepi() {
  return (
    <>
      <path d="M64 80 L67 54 Q101 42 136 48 L134 76 Q100 70 64 80 Z" fill={UNIFORM} />
      <path d="M67 54 Q101 42 136 48 Q103 59 67 54 Z" fill="var(--postie-top)" />
      <path d="M64 80 Q100 70 134 76 L134 68 Q100 62 65 72 Z" fill={BAND} />
      <circle cx="84" cy="70" r="4.5" fill="var(--postie-yellow)" strokeWidth="1.8" />
      <path d="M60 79 Q78 75 96 74 Q90 85 66 89 Q52 90 52 85 Q53 81 60 79 Z" fill={BAND} />
    </>
  );
}

const EYE_SHIFT: Record<'open' | 'aside' | 'down' | 'up', [number, number]> = {
  open: [0, 0],
  aside: [4, 0],
  down: [0, 3],
  up: [1, -3],
};

function Face({ eyes, mouth }: { eyes: Eyes; mouth: Mouth }) {
  const stroke = { fill: 'none', stroke: LINE, strokeWidth: 2.6, strokeLinecap: 'round' as const };
  return (
    <>
      {eyes === 'closed' && <path d="M80 98 Q85 102 90 98 M101 97 Q106 101 111 97" {...stroke} />}
      {eyes === 'joy' && <path d="M80 99 Q85 94 90 99 M101 98 Q106 93 111 98" {...stroke} />}
      {eyes !== 'closed' && eyes !== 'joy' && (
        <g fill={LINE}>
          <circle cx={85 + EYE_SHIFT[eyes][0]} cy={98 + EYE_SHIFT[eyes][1]} r="3.2" />
          <circle cx={106 + EYE_SHIFT[eyes][0]} cy={97 + EYE_SHIFT[eyes][1]} r="3.2" />
        </g>
      )}
      {mouth === 'smile' && <path d="M86 111 Q97 119 108 110" {...stroke} />}
      {mouth === 'flat' && <path d="M90 113 Q97 116 104 113" {...stroke} />}
      {mouth === 'o' && <ellipse cx="97" cy="113" rx="4" ry="5" fill={LINE} />}
      {mouth === 'open' && (
        <path d="M86 109 Q97 111 108 108 Q104 121 96 121 Q88 120 86 109 Z" fill={LINE} />
      )}
      <circle cx="116" cy="106" r="4.5" fill="var(--postie-cheek)" opacity=".45" />
    </>
  );
}

/** Held up in the raised hand; the hand is drawn after it, over its corner. */
function Letter({ sealed = false }: { sealed?: boolean }) {
  return (
    <g transform="rotate(-14 170 86)">
      <rect x="150" y="70" width="40" height="28" rx="2" fill="var(--postie-paper)" />
      <path d="M150 70 L170 86 L190 70" fill="none" />
      {sealed && <circle cx="170" cy="86" r="6" fill="var(--postie-red)" strokeWidth="1.8" />}
    </g>
  );
}

/** A letter being written, held against the chest. */
function Note() {
  return (
    <g transform="rotate(-8 118 172)">
      <rect x="96" y="158" width="44" height="30" rx="2" fill="var(--postie-paper)" />
      <path d="M104 168 H130 M104 176 H124" fill="none" strokeWidth="1.8" />
    </g>
  );
}

/** A kraft parcel with its tape, held against the chest: files. */
function Parcel() {
  return (
    <g transform="rotate(-6 116 174)">
      <rect x="90" y="152" width="52" height="40" rx="3" fill="var(--postie-kraft)" />
      <path
        d="M116 152 V192 M90 168 H142"
        fill="none"
        stroke="var(--postie-band)"
        strokeWidth="2"
      />
    </g>
  );
}
