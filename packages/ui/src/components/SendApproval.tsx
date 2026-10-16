import type { SendRequest } from '@hey-postie/core';
import { useEffect, useState } from 'react';
import { useCore, useText } from '../core/CoreProvider';
import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * The user's yes or no before Claude sends a letter for them (spec 2026-10-16-mcp-design): the
 * recipient and the exact text, as Claude wrote it. Closing the dialog is a no; a request that
 * times out in the core closes it too. Requests wait in line, one dialog at a time.
 */
export function SendApproval() {
  const core = useCore();
  const text = useText();
  const [queue, setQueue] = useState<SendRequest[]>([]);

  useEffect(() => {
    const offRequested = core.events.on('assistant.sendRequested', (request) =>
      setQueue((waiting) => [...waiting, request]),
    );
    const offSettled = core.events.on('assistant.sendSettled', ({ id }) =>
      setQueue((waiting) => waiting.filter((request) => request.id !== id)),
    );
    return () => {
      offRequested();
      offSettled();
    };
  }, [core]);

  const request = queue[0];
  if (!request) return null;
  const answer = (approved: boolean) => core.assistant.answerSend(request.id, approved);

  return (
    <Dialog key={request.id} title={text('assistant.approval.title')} onClose={() => answer(false)}>
      <p className="m-0">
        {text('assistant.approval.to').replace('{name}', request.title)}{' '}
        <span className="font-mono text-[12px] text-ink-muted">{request.chatId}</span>
      </p>
      <blockquote className="m-0 max-h-[240px] overflow-y-auto rounded-sm border-l-[3px] border-line bg-paper px-3 py-2 whitespace-pre-wrap wrap-anywhere">
        {request.body}
      </blockquote>
      <p className="m-0 text-[13px] text-ink-muted">{text('assistant.approval.hint')}</p>
      <div className="flex justify-end gap-3">
        <Button onClick={() => answer(false)}>{text('assistant.approval.decline')}</Button>
        <Button variant="primary" data-autofocus="" onClick={() => answer(true)}>
          {text('assistant.approval.send')}
        </Button>
      </div>
    </Dialog>
  );
}
