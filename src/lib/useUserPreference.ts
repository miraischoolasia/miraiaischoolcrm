import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

// One screen setting of the person using the CRM. It is read from this browser at once and then from their account
// (user_ui_preferences), so it follows them to another computer; saving writes both. A database without the table (or
// no connection) simply keeps it in this browser.
export function useUserPreference<T>(key: string, fallback: T, sanitize: (raw: unknown) => T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback)
  const userIdRef = useRef<string | null>(null)
  const sanitizeRef = useRef(sanitize)
  sanitizeRef.current = sanitize

  const storageKey = (userId: string | null) => `pref:${userId ?? 'local'}:${key}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      let userId: string | null = null
      try {
        userId = (await supabase?.auth.getSession())?.data.session?.user.id ?? null
      } catch {
        userId = null
      }
      userIdRef.current = userId
      try {
        const stored = window.localStorage.getItem(storageKey(userId))
        if (stored && !cancelled) {
          setValue(sanitizeRef.current(JSON.parse(stored)))
        }
      } catch {
        // Nothing stored here yet.
      }
      if (!supabase || !userId) {
        return
      }
      try {
        const { data } = await supabase.from('user_ui_preferences').select('value').eq('key', key).maybeSingle()
        if (data && !cancelled) {
          setValue(sanitizeRef.current(data.value))
          try {
            window.localStorage.setItem(storageKey(userId), JSON.stringify(data.value))
          } catch {
            // The copy in this browser is only a convenience.
          }
        }
      } catch {
        // No table yet: this browser's copy stays.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const save = useCallback(
    (next: T) => {
      setValue(next)
      try {
        window.localStorage.setItem(storageKey(userIdRef.current), JSON.stringify(next))
      } catch {
        // Private window: the setting lasts until the page is closed.
      }
      if (supabase && userIdRef.current) {
        void Promise.resolve(
          supabase.from('user_ui_preferences').upsert({ key, value: next as never, updated_at: new Date().toISOString() }, { onConflict: 'teacher_id,key' }),
        ).catch(() => undefined)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  return [value, save]
}
