/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    // The App tests render the whole workspace; on a busy machine, with all the
    // test files running together, a few take longer than the 5 s default.
    testTimeout: 20000,
    setupFiles: ['./src/test/setup.ts'],
  },
})
