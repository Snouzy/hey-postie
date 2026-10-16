import { Paperclip } from 'lucide-react';
import { useRef } from 'react';
import { useText } from '../core/CoreProvider';
import { Button } from './Button';

// The real file input stays in the accessibility tree; the paperclip is its visible face.
const FILE_INPUT = 'absolute h-px w-px overflow-hidden [clip:rect(0_0_0_0)]';

/** The composer's paperclip: picks files, which leave as parcels. */
export function AttachButton({
  className,
  disabled,
  onAttach,
}: {
  className: string;
  disabled: boolean;
  onAttach: (files: File[]) => void;
}) {
  const text = useText();
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={fileInput}
        className={FILE_INPUT}
        type="file"
        multiple
        // The paperclip is the Tab stop; the input stays in the tree for its own name.
        tabIndex={-1}
        aria-label={text('composer.attach')}
        disabled={disabled}
        onChange={(event) => {
          onAttach([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <Button
        variant="ghost"
        className={className}
        aria-label={text('composer.attach')}
        disabled={disabled}
        onClick={() => fileInput.current?.click()}
      >
        <Paperclip size={18} aria-hidden />
      </Button>
    </>
  );
}
