import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  build: {
    outDir: '../dist/web',
    // Old hashed chunks stay valid for tabs that loaded an earlier build.
    emptyOutDir: false,
    chunkSizeWarningLimit: 1500,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8790',
      '/ws': { target: 'ws://127.0.0.1:8790', ws: true },
    },
  },
});
