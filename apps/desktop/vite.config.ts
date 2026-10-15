import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed port and no HMR noise in the console.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: ['es2022', 'safari16'], outDir: 'dist', emptyOutDir: true },
});
