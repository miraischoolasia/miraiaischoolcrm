/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Lets the dev server (localhost) read the live WhatsApp gateway: the browser talks to /wa-proxy on
    // localhost and the dev server forwards it, so the gateway's "only the CRM address" rule is not hit.
    // Used by pointing VITE_WHATSAPP_API_URL at /wa-proxy in .env.development.local; nothing else uses it.
    proxy: {
      '/wa-proxy': {
        target: process.env.WA_PROXY_TARGET ?? 'https://wa.miraischool.asia',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wa-proxy/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (request) => {
            request.removeHeader('origin')
            request.removeHeader('referer')
          })
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    // The App tests render the whole workspace; on a busy machine, with all the
    // test files running together, a few take longer than the 5 s default.
    testTimeout: 20000,
    setupFiles: ['./src/test/setup.ts'],
  },
})
