import { useText } from '../core/CoreProvider';
import { Postie } from '../illustrations/Postie';

// The drop lands on the conversation underneath, not on the overlay: no pointer events.
const OVERLAY =
  'pointer-events-none absolute inset-0 z-float flex flex-col items-center justify-center gap-3 rounded border-3 border-dashed border-kraft bg-[color-mix(in_srgb,var(--paper)_88%,transparent)]';

/** Shown over the conversation while files are dragged across it. */
export function DropOverlay() {
  const text = useText();
  return (
    <div className={OVERLAY} role="status">
      <Postie mood="parcel" label={text('postie.alt.parcel')} size={120} />
      <p className="m-0 font-heading text-[20px] text-ink [font-variation-settings:'SOFT'_100]">
        {text('parcel.drop')}
      </p>
    </div>
  );
}
