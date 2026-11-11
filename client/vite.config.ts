import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = 'http://127.0.0.1:' + (process.env.API_PORT || '4000');
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': api, '/evidence': api, '/demo-store': api, '/openapi.yaml': api, '/webhooks': api },
  },
  build: { chunkSizeWarningLimit: 4000 },
});
