import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const target = process.env.DROOIT_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/socket.io': { target, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
