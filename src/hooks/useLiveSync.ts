import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// The tables the CRM page shows. A change in any of them (by someone else, or by a teacher's phone) makes
// the page read the data again straight away, so nobody has to refresh to see it.
export const LIVE_TABLES = [
  'students',
  'classrooms',
  'teachers',
  'leads',
  'lead_options',
  'packages',
  'schedules',
  'schedule_students',
  'schedule_exceptions',
  'trial_bookings',
  'makeup_plans',
  'lesson_logs',
  'lesson_log_student_reviews',
] as const

const POLL_MS = 15_000
const DEBOUNCE_MS = 400

// Keeps the data of the page current without a refresh:
//  - the database tells the page the moment a row changes (Supabase Realtime), and
//  - every 15 seconds, and whenever the tab is looked at again, the page checks anyway,
//    so it still catches up where Realtime is off or the connection dropped.
// `sync` reads everything again and swaps in what changed; it never runs twice at once.
export function useLiveSync(enabled: boolean, sync: () => Promise<void>) {
  const syncRef = useRef(sync)
  useEffect(() => {
    syncRef.current = sync
  })

  useEffect(() => {
    if (!enabled) {
      return
    }
    let stopped = false
    let running = false
    let again = false
    let debounce: number | undefined

    const run = async () => {
      if (stopped || document.hidden) {
        return
      }
      if (running) {
        again = true
        return
      }
      running = true
      try {
        await syncRef.current()
      } catch {
        // Offline or a hiccup: the next round tries again.
      } finally {
        running = false
        if (again && !stopped) {
          again = false
          void run()
        }
      }
    }
    const soon = () => {
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => void run(), DEBOUNCE_MS)
    }
    const onVisible = () => {
      if (!document.hidden) {
        void run()
      }
    }

    const timer = window.setInterval(() => void run(), POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    if (supabase) {
      try {
        let next = supabase.channel('crm-live')
        for (const table of LIVE_TABLES) {
          next = next.on('postgres_changes', { event: '*', schema: 'public', table }, soon)
        }
        channel = next.subscribe()
      } catch {
        // Realtime unavailable: the 15-second check still keeps the page current.
      }
    }

    return () => {
      stopped = true
      window.clearInterval(timer)
      window.clearTimeout(debounce)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (channel && supabase) {
        void supabase.removeChannel(channel)
      }
    }
  }, [enabled])
}
