import { useText } from '../core/CoreProvider';
import type { MessageKey } from '../i18n';
import { Button } from './Button';

interface RetryNoticeProps {
  error: MessageKey;
  onRetry: () => void;
}

// leading-[1.3] again: tailwind-merge drops the Button's line height when a font size follows it.
const RETRY = 'px-3 py-[2px] text-[13px] leading-[1.3]';

/** A load that failed: Postie's sentence and a way to ask again. Never mistaken for "nothing". */
export function RetryNotice({ error, onRetry }: RetryNoticeProps) {
  const text = useText();
  return (
    <p
      className="m-0 flex flex-wrap items-center gap-2 font-heading text-red [font-variation-settings:'SOFT'_100]"
      role="alert"
    >
      {text(error)}
      <Button className={RETRY} onClick={onRetry}>
        {text('message.retry')}
      </Button>
    </p>
  );
}
