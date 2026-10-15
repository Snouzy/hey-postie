import type { Message, MessageStatus } from '@hey-postie/core';
import { AlertCircle, Check, CheckCheck, Clock, Stamp } from 'lucide-react';
import { useLocale, useText } from '../core/CoreProvider';
import { formatTime } from '../i18n/dates';
import { Button } from './Button';
import { Linkify } from './Linkify';
import styles from './MessageBubble.module.css';

interface MessageBubbleProps {
  message: Message;
  /** The last bubble of a run always shows its time; the others only on hover. */
  last: boolean;
  onRetry: (message: Message) => void;
  onOpenLink: (url: string) => void;
  /** From a letter sealed for another device: opens the sender's devices in the details pane. */
  onShowDevices?: (() => void) | undefined;
}

export function MessageBubble({
  message,
  last,
  onRetry,
  onOpenLink,
  onShowDevices,
}: MessageBubbleProps) {
  const text = useText();
  const locale = useLocale();
  const sealed = message.encryption === 'undecryptable';
  const wax = message.direction === 'out' && message.encryption === 'omemo';
  const mention = message.isMention && message.direction === 'in';
  const classes = [
    styles.bubble,
    styles[message.direction],
    last ? styles.last : '',
    mention ? styles.mention : '',
  ].join(' ');

  return (
    <div className={classes} data-status={message.status}>
      {mention && <span className={styles.srOnly}>{text('message.mention')}</span>}
      {wax && (
        <span className={styles.wax} title={text('message.encrypted')}>
          <span className={styles.srOnly}>{text('message.encrypted')}</span>
        </span>
      )}
      <p className={sealed ? styles.sealed : styles.body}>
        {sealed ? (
          <>
            <Stamp size={16} className={styles.seal} aria-hidden />
            {text('message.undecryptable')}
          </>
        ) : (
          <Linkify text={message.body} onOpenLink={onOpenLink} />
        )}
      </p>
      {sealed && (
        <p className={styles.help}>
          {text('message.undecryptableHelp')}
          {onShowDevices && (
            <Button className={styles.helpAction} onClick={onShowDevices}>
              {text('message.checkDevices')}
            </Button>
          )}
        </p>
      )}
      <span className={styles.meta}>
        <time dateTime={message.sentAt.toISOString()}>{formatTime(locale, message.sentAt)}</time>
        {message.direction === 'out' && (
          <span className={styles.stamp} title={text(`status.${message.status}`)}>
            <StatusIcon status={message.status} />
            <span className={styles.stampLabel}>{text(`status.${message.status}`)}</span>
          </span>
        )}
      </span>
      {message.status === 'failed' && (
        <Button variant="danger" className={styles.retry} onClick={() => onRetry(message)}>
          {text('message.retry')}
        </Button>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'pending':
      return <Clock size={14} aria-hidden />;
    case 'sent':
      return <Check size={14} aria-hidden />;
    case 'delivered':
    case 'read':
      return <CheckCheck size={14} aria-hidden />;
    case 'failed':
      return <AlertCircle size={14} aria-hidden />;
  }
}
