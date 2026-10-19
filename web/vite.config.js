import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://127.0.0.1:3000',
      '/workspaces': 'http://127.0.0.1:3000',
      '/work-items': 'http://127.0.0.1:3000',
      '/teams': 'http://127.0.0.1:3000',
      '/overview': 'http://127.0.0.1:3000',
      '/notifications': 'http://127.0.0.1:3000',
      '/healthz': 'http://127.0.0.1:3000',
      '/readyz': 'http://127.0.0.1:3000',
      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true
      }
    }
  }
});
