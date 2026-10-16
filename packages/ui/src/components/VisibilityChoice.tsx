import type { RoomVisibility } from '@hey-postie/core';
import { Globe, Lock } from 'lucide-react';
import { useId } from 'react';
import { useText } from '../core/CoreProvider';

interface VisibilityChoiceProps {
  value: RoomVisibility;
  onChange: (value: RoomVisibility) => void;
  disabled?: boolean;
}

const VISIBILITIES: readonly { value: RoomVisibility; icon: typeof Lock }[] = [
  { value: 'private', icon: Lock },
  { value: 'public', icon: Globe },
];

/** A choice card: the radio, an icon, a title and its hint; the chosen one wears a navy border. */
const CHOICE =
  'flex flex-1 cursor-pointer items-start gap-2 rounded-sm border border-line-strong bg-paper-raised p-3 has-checked:border-navy has-checked:bg-fill-hover [&_input]:accent-navy';

/** "Who can come in": Private or Public as two radio cards, each with its hint. */
export function VisibilityChoice({ value, onChange, disabled = false }: VisibilityChoiceProps) {
  const text = useText();
  const hintId = useId();
  const name = useId();
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={disabled}>
      <legend className="mb-1 p-0 text-[13px] font-semibold text-ink-muted">
        {text('createRoom.visibility')}
      </legend>
      <div className="flex gap-2">
        {VISIBILITIES.map(({ value: choice, icon: Icon }) => (
          <label key={choice} className={CHOICE}>
            <input
              type="radio"
              name={name}
              value={choice}
              className="mt-1"
              checked={value === choice}
              onChange={() => onChange(choice)}
              aria-describedby={`${hintId}-${choice}`}
            />
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-1 font-semibold">
                <Icon size={14} aria-hidden />
                {text(`createRoom.${choice}`)}
              </span>
              <span id={`${hintId}-${choice}`} className="text-[13px] text-ink-muted">
                {text(`createRoom.${choice}Hint`)}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
