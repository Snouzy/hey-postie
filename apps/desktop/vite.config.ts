import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tauriConf from './src-tauri/tauri.conf.json';

// Tauri expects a fixed port and no HMR noise in the console.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // The app version has one source of truth, tauri.conf.json; the interface shows it in About.
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(tauriConf.version) },
  server: { port: 1420, strictPort: true },
  build: { target: ['es2022', 'safari16'], outDir: 'dist', emptyOutDir: true },
});
