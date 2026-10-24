import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// A school setting kept in one app_settings row, read once after sign-in and shared by every screen that shows it.
//   * Before anybody is signed in the row cannot be read (the database answers 401), so nothing is read and nothing is
//     cached: the fallback is shown, and the row is read when the sign-in happens.
//   * A failed read is never cached either: the next screen that asks (or the next sign-in) tries again.
export function createSettingStore<T>(key: string, read: (value: unknown) => T, fallback: T) {
  let cached: T | null = null
  let loading: Promise<void> | null = null
  let watching = false
  const listeners = new Set<() => void>()

  function publish(next: T) {
    cached = next
    listeners.forEach((listener) => listener())
  }

  async function reload() {
    if (!supabase) {
      publish(fallback)
      return
    }
    try {
      const auth = supabase.auth
      if (auth && typeof auth.getSession === 'function') {
        const { data: sessionData } = await auth.getSession()
        if (!sessionData.session) {
          return
        }
      }
      const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
      if (error) {
        return
      }
      // No row is an answer too: the setting is at its default.
      publish(read(data?.value))
    } catch {
      // Not read this time; it is tried again at the next sign-in or the next screen that asks.
    }
  }

  function watchSignIn() {
    if (watching || !supabase || typeof supabase.auth?.onAuthStateChange !== 'function') {
      return
    }
    watching = true
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        void reload()
      } else if (event === 'SIGNED_OUT') {
        cached = null
      }
    })
  }

  function use(): T {
    const [, rerender] = useState(0)
    useEffect(() => {
      const listener = () => rerender((count) => count + 1)
      listeners.add(listener)
      watchSignIn()
      if (cached === null && loading === null) {
        loading = reload().finally(() => {
          loading = null
        })
      }
      return () => {
        listeners.delete(listener)
      }
    }, [])
    return cached ?? fallback
  }

  return { reload, use }
}
