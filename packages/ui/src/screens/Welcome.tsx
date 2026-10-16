import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';
import { cn } from '../lib/cn';

// `box-border`: the padding counts inside the height, or the screen overflows the window by that
// much. `justify-center-safe`: taller than the window (200% zoom), the top stays reachable.
const SCREEN =
  'box-border flex min-h-full flex-col items-center justify-center-safe gap-3 px-6 py-12 text-center';
const DOOR = 'cursor-pointer rounded-full border-2 border-navy px-6 py-3 font-semibold';

interface WelcomeProps {
  onSignIn: () => void;
  onCreateAccount: () => void;
}

/** The first screen: Postie, the name, and the two doors in. */
export function Welcome({ onSignIn, onCreateAccount }: WelcomeProps) {
  const text = useText();
  return (
    <main className={SCREEN}>
      <Postie mood="happy" label={text('postie.alt.happy')} size={200} />
      <h1 className="text-[44px] text-navy">{text('welcome.title')}</h1>
      <p className="m-0 text-[17px] text-ink-muted">{text('welcome.tagline')}</p>
      <div className="mt-6 flex gap-3">
        <button type="button" className={cn(DOOR, 'bg-navy text-navy-contrast')} onClick={onSignIn}>
          {text('welcome.signIn')}
        </button>
        <button
          type="button"
          className={cn(DOOR, 'bg-transparent text-navy')}
          onClick={onCreateAccount}
        >
          {text('welcome.createAccount')}
        </button>
      </div>
    </main>
  );
}
