import { Bell, type LucideIcon, Palette, ShieldCheck, Sliders, User, Wrench } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useText } from '../../core/CoreProvider';
import { SETTINGS_SECTIONS, type SettingsSection, sectionTitleKey } from './sections';

// Narrower than the app's minimum window (640px, as in `SettingsWindow`): the nav becomes a row
// above the panel.
const NAV =
  'flex flex-[0_0_200px] flex-col gap-1 border-r border-line pr-6 [@media(max-width:640px)]:flex-none [@media(max-width:640px)]:flex-row [@media(max-width:640px)]:flex-wrap [@media(max-width:640px)]:border-r-0 [@media(max-width:640px)]:border-b [@media(max-width:640px)]:p-0 [@media(max-width:640px)]:pb-3';
const TAB =
  'flex cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent px-3 py-2 text-left text-ink hover:bg-kraft-soft aria-selected:bg-kraft-soft aria-selected:font-semibold aria-selected:text-navy';

interface SettingsNavProps {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  /** `tabId(section)` and `panelId(section)` tie each tab to its panel, for the ARIA tabs model. */
  tabId: (section: SettingsSection) => string;
  panelId: (section: SettingsSection) => string;
  /** The active tab takes the focus when the window opens, unless something else is asked to. */
  autofocus: boolean;
}

const ICONS: Record<SettingsSection, LucideIcon> = {
  general: Sliders,
  account: User,
  appearance: Palette,
  notifications: Bell,
  privacy: ShieldCheck,
  advanced: Wrench,
};

/**
 * The left column of the settings window: a vertical `role="tablist"`, one Tab stop (roving
 * tabindex), arrows move and select at once, Home and End jump to the ends.
 */
export function SettingsNav({ active, onSelect, tabId, panelId, autofocus }: SettingsNavProps) {
  const text = useText();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = SETTINGS_SECTIONS.indexOf(active);
    const last = SETTINGS_SECTIONS.length - 1;
    const next =
      event.key === 'ArrowDown'
        ? Math.min(at + 1, last)
        : event.key === 'ArrowUp'
          ? Math.max(at - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const section = SETTINGS_SECTIONS[next];
    if (!section) return;
    onSelect(section);
    document.getElementById(tabId(section))?.focus();
  }

  return (
    <div
      className={NAV}
      role="tablist"
      aria-orientation="vertical"
      aria-label={text('settings.sections')}
      onKeyDown={onKeyDown}
    >
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = ICONS[section];
        const selected = section === active;
        return (
          <button
            key={section}
            id={tabId(section)}
            type="button"
            role="tab"
            className={TAB}
            aria-selected={selected}
            aria-controls={panelId(section)}
            tabIndex={selected ? 0 : -1}
            data-autofocus={selected && autofocus ? '' : undefined}
            onClick={() => onSelect(section)}
          >
            <Icon size={16} aria-hidden />
            {text(sectionTitleKey(section))}
          </button>
        );
      })}
    </div>
  );
}
