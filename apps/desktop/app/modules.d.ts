// The UI package exposes its stylesheet as a side-effect import.
declare module '@hey-postie/ui/styles';

// Injected by vite.config.ts from src-tauri/tauri.conf.json.
interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
}
