// Configures the React app and same-origin API proxy for development and preview.
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = {
    '/api': {
      target: env.API_PROXY_TARGET || 'http://localhost:4000',
      changeOrigin: false
    }
  };

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { proxy }
  };
});
