import { KeyRound, UserPlus, Users } from 'lucide-react';
import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import { Button } from './Button';

interface WelcomeCardProps {
  onDismiss: () => void;
}

/** The first-launch card: Postie, three things to know, "Got it". Shown once per account. */
export function WelcomeCard({ onDismiss }: WelcomeCardProps) {
  const text = useText();
  const lines = [
    { icon: UserPlus, key: 'welcomeCard.contact' },
    { icon: Users, key: 'welcomeCard.room' },
    { icon: KeyRound, key: 'welcomeCard.sealed' },
  ] as const;
  return (
    <section
      className="flex w-[min(420px,100%)] flex-col items-center gap-4 rounded border border-line bg-paper-raised px-6 py-8 text-center shadow-card"
      aria-labelledby="welcome-card-title"
    >
      <Postie mood="waving" label={text('postie.alt.waving')} size={120} />
      <h2 id="welcome-card-title" className="m-0 text-[24px] text-navy">
        {text('welcomeCard.title')}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0 text-left">
        {lines.map(({ icon: Icon, key }) => (
          <li
            key={key}
            className="flex items-start gap-3 font-heading text-[16px] [font-variation-settings:'SOFT'_100]"
          >
            <Icon size={18} aria-hidden className="mt-[2px] shrink-0 text-kraft-ink" />
            <span>{text(key)}</span>
          </li>
        ))}
      </ul>
      <Button variant="primary" onClick={onDismiss}>
        {text('welcomeCard.dismiss')}
      </Button>
    </section>
  );
}
