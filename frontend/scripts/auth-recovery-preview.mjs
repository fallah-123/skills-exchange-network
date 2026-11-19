// Explicit local-only fixture. Never imported by the application or production build.
import { createServer } from 'vite';

const server = await createServer({
  server: {
    host: '127.0.0.1', port: 5180, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4108', changeOrigin: false } },
  },
  plugins: [{
    name: 'local-auth-recovery-fixture',
    transformIndexHtml() {
      return [{ tag: 'script', injectTo: 'head-prepend', children: `
        const scenario = new URL(location.href).searchParams.get('sessionDemo');
        const realFetch = window.fetch.bind(window);
        let simulated = false;
        window.fetch = async (input, options) => {
          if (!simulated && input === '/api/auth/me' && ['429', '500', 'network'].includes(scenario)) {
            simulated = true;
            if (scenario === 'network') throw new TypeError('Local simulated network failure');
            return new Response('Local simulated temporary failure', {
              status: Number(scenario), headers: scenario === '429' ? { 'Retry-After': '5' } : {}
            });
          }
          return realFetch(input, options);
        };
      ` }];
    },
  }],
});
await server.listen();
console.log('Local authentication preview: http://127.0.0.1:5180');
console.log('One simulated failure per load: /?sessionDemo=429 (or 500, network). Retry uses the real local API.');
