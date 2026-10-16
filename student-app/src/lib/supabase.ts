// Phones (iOS / Android): the session is kept on the device with expo-sqlite's
// localStorage, and token refresh only runs while the app is in front (as
// the Expo Supabase guide sets it up). The web build uses supabase.web.ts.
import 'expo-sqlite/localStorage/install'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? ''

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'https://not-configured.invalid', key || 'missing', {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
