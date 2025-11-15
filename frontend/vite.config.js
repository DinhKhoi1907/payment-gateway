import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/', // Ensure assets are served from root
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_NESTJS_URL || process.env.NESTJS_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});


