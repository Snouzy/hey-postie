/** The layout of the two "Create an account" steps (`CreateAccount` and `RegistrationForm`). */
export const createAccountLayout = {
  // `box-border`: the padding counts inside the height, or the screen overflows the window by that
  // much. `justify-center-safe`: taller than the window (200% zoom), the top stays reachable.
  screen: 'box-border flex min-h-full flex-col items-center justify-center-safe gap-3 px-6 py-12',
  title: 'text-[32px] text-navy',
  form: 'flex w-[min(400px,100%)] flex-col gap-3 rounded bg-paper-raised p-6 shadow-card',
  step: 'text-[22px]',
  // Postie explains the step, hence the heading font.
  help: "m-0 font-heading text-[15px] text-ink-muted [font-variation-settings:'SOFT'_100]",
  link: 'self-start text-[14px] text-navy',
  // Reserve the room so the form does not jump when Postie speaks.
  message:
    "m-0 min-h-[2.5em] font-heading text-[15px] text-ink-muted [font-variation-settings:'SOFT'_100] [&[role=alert]]:text-red",
  actions: 'flex justify-between gap-3',
};
