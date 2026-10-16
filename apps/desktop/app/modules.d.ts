// The UI package exposes its stylesheet as a side-effect import.
declare module '@hey-postie/ui/styles';

// VITE_APP_VERSION is injected by vite.config.ts from src-tauri/tauri.conf.json.
interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  /**
   * "<worktree> · <branch>" in a dev window: scripts/dev.mjs sets it in the environment, and Vite
   * hands every `VITE_` variable to the page. Absent in a build.
   */
  readonly VITE_DEV_LABEL?: string;
}
