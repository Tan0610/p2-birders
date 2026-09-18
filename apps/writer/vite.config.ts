import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  // Swarm ID bundles its own copy of bee-js, so the writer is heavier than the reader.
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1000 },
});
