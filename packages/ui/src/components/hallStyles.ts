/** Styles shared by the parts of the hall panel (`RoomDetails`). */
export const hallStyles = {
  /** The small uppercase heading of each part, as in `ContactList`. */
  heading:
    'mx-0 mt-0 mb-1 p-0 font-text text-[12px] font-bold tracking-[0.04em] uppercase text-ink-muted',
  /** Postie's voice: his sentences, never a hall's own text. */
  postie: "m-0 font-heading [font-variation-settings:'SOFT'_100]",
  /** An item of a `role="menu"` popover, like `RoomRowMenu`'s and `MessageActions`'. */
  menuItem:
    'flex cursor-pointer items-center gap-2 rounded-sm border-none bg-transparent p-2 text-left whitespace-nowrap text-ink hover:bg-paper focus-visible:bg-paper data-[tone=danger]:text-red',
};
