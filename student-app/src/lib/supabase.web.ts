// The web build: the browser keeps the session in its own localStorage
// (supabase-js's default there), and refreshes the token by itself.
import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? ''

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'https://not-configured.invalid', key || 'missing', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
