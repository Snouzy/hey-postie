import type { Account } from '@hey-postie/core';
import { useId } from 'react';
import { useText } from '../../core/CoreProvider';
import { Dialog } from '../Dialog';
import { AccountSection } from './AccountSection';
import { AdvancedSection } from './AdvancedSection';
import { AppearanceSection } from './AppearanceSection';
import { GeneralSection } from './GeneralSection';
import { NotificationsSection } from './NotificationsSection';
import { PrivacySection } from './PrivacySection';
import { SettingsNav } from './SettingsNav';
import type { SettingsSection } from './sections';

interface SettingsWindowProps {
  account: Account;
  /** The open section; `Main` keeps it, so a round trip to Licenses comes back to the same one. */
  section: SettingsSection;
  onSelectSection: (section: SettingsSection) => void;
  onClose: () => void;
  onSignOut: () => void;
  /** These two open their dialog in place of the window (no nested dialogs). */
  onDeleteAccount: () => void;
  onLicenses: () => void;
  onOpenLink: (url: string) => void;
  /** Set when the window comes back from one of those dialogs: the focus returns to its button. */
  returnFocus: 'licenses' | 'deleteAccount' | null;
}

/**
 * The settings, as a window: sections on the left, the open one on the right. Every change
 * applies at once; there is no "Save". The values live in `SettingsProvider` (see `App`).
 */
export function SettingsWindow({
  account,
  section,
  onSelectSection,
  onClose,
  onSignOut,
  onDeleteAccount,
  onLicenses,
  onOpenLink,
  returnFocus,
}: SettingsWindowProps) {
  const text = useText();
  const id = useId();
  const tabId = (s: SettingsSection) => `${id}-tab-${s}`;
  const panelId = (s: SettingsSection) => `${id}-panel-${s}`;
  const titleId = `${id}-title-${section}`;

  return (
    <Dialog title={text('settings.title')} onClose={onClose} size="large">
      {/* Fills the large Dialog card: the nav column, a rule, the scrolling panel. Narrower than the
          app's minimum window (640px), the nav becomes a row above the panel. */}
      <div className="flex min-h-0 flex-1 gap-6 [@media(max-width:640px)]:flex-col">
        <SettingsNav
          active={section}
          onSelect={onSelectSection}
          tabId={tabId}
          panelId={panelId}
          autofocus={returnFocus === null}
        />
        <div
          key={section}
          id={panelId(section)}
          className="min-w-0 flex-1 overflow-y-auto pr-2"
          role="tabpanel"
          aria-labelledby={tabId(section)}
        >
          {section === 'general' && <GeneralSection titleId={titleId} />}
          {section === 'account' && (
            <AccountSection
              titleId={titleId}
              account={account}
              onSignOut={onSignOut}
              onDeleteAccount={onDeleteAccount}
              focusDelete={returnFocus === 'deleteAccount'}
            />
          )}
          {section === 'appearance' && <AppearanceSection titleId={titleId} />}
          {section === 'notifications' && <NotificationsSection titleId={titleId} />}
          {section === 'privacy' && <PrivacySection titleId={titleId} />}
          {section === 'advanced' && (
            <AdvancedSection
              titleId={titleId}
              onLicenses={onLicenses}
              onOpenLink={onOpenLink}
              focusLicenses={returnFocus === 'licenses'}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
