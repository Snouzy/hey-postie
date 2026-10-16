/** Shared by every section of the settings window: one title, then groups under small headings. */
export const sectionStyles = {
  section: 'flex flex-col gap-6',
  title: 'm-0 text-[22px]',
  // A `fieldset` or a `section`: the fieldset's own margin, padding, border and min-width go.
  group: 'm-0 flex min-w-0 flex-col gap-2 border-none p-0',
  heading: 'm-0 p-0 font-text text-[12px] font-bold tracking-[0.04em] text-ink-muted uppercase',
  radio: 'flex cursor-pointer items-center gap-2 [&_input]:accent-navy',
  hint: 'm-0 text-[13px] text-ink-muted',
  text: 'm-0',
  mono: 'font-mono text-[12px] wrap-anywhere',
  muted: 'text-ink-muted',
  row: 'flex flex-wrap items-center gap-3',
  link: 'text-navy',
};
