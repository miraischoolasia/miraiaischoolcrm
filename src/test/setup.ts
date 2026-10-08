import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Tests never talk to the school's real WhatsApp inbox, even on a machine
// where it is switched on in .env.local.
vi.stubEnv('VITE_CHATWOOT_URL', '')
vi.stubEnv('VITE_WHATSAPP_API_URL', '')

afterEach(() => {
  cleanup()
})
