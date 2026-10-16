/**
 * The worktree a dev window runs from, in the bottom-right corner (`pnpm desktop:dev`): many
 * sessions work in parallel, and the author must see whose code is on screen. Never in a build.
 * It lets clicks through, and screen readers skip it: it is a note for the developer, not the UI.
 */
export function DevRibbon({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed right-2 bottom-2 z-float rounded-full bg-yellow px-2 py-[2px] font-mono text-[11px] text-on-yellow shadow-card"
    >
      DEV · {label}
    </div>
  );
}
