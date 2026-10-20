/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { leftoverBrandColors, rewriteBrandColors } from './src/lib/brandShades.ts'

// Mirai's pinks in the CSS become CSS variables (defaults: the same pinks), so a school's own colours from
// Class Settings > Brand reach every page (src/lib/brandShades.ts). The build stops if any pink is missed.
function brandColors(): Plugin {
  return {
    name: 'brand-colors',
    transform(code, id) {
      if (!/\.css($|\?)/.test(id)) {
        return null
      }
      const rewritten = rewriteBrandColors(code)
      return rewritten === code ? null : { code: rewritten, map: null }
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) {
          continue
        }
        const css = rewriteBrandColors(String(file.source))
        const missed = leftoverBrandColors(css)
        if (missed.length > 0) {
          this.error(`${file.fileName} still has Mirai's pink written in: ${missed.slice(0, 5).join(', ')}`)
        }
        file.source = css
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), brandColors()],
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
    // The student app (student-app/, Expo) has its own packages and checks.
    exclude: ['**/node_modules/**', 'student-app/**'],
  },
})
