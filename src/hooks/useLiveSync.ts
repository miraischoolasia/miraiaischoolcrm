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

// Every read is 13 requests that download all the data, so it must not run when nothing changed.
const POLL_MS = 30_000
// While Realtime is connected it reports every change itself; this slow check only guards against a
// change it silently missed.
const SAFETY_EVERY_TICKS = 10
const DEBOUNCE_MS = 400

// Keeps the data of the page current without a refresh:
//  - the database tells the page the moment a row changes (Supabase Realtime), and
//  - whenever the tab is looked at again the page checks anyway, and every 30 seconds it checks while
//    Realtime is not connected (off, or the connection dropped), so it still catches up. While Realtime is
//    connected the check is only every 5 minutes.
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
    // True while the Realtime channel is connected; a read is also made when it comes back after a gap.
    let live = false
    let wasDown = false
    let ticks = 0

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
    // Looking at the tab fires both "visible" and "focus": one debounced read covers both.
    const onVisible = () => {
      if (!document.hidden) {
        soon()
      }
    }

    const timer = window.setInterval(() => {
      ticks += 1
      if (!live || ticks % SAFETY_EVERY_TICKS === 0) {
        void run()
      }
    }, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
    if (supabase) {
      try {
        let next = supabase.channel('crm-live')
        for (const table of LIVE_TABLES) {
          next = next.on('postgres_changes', { event: '*', schema: 'public', table }, soon)
        }
        channel = next.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            live = true
            if (wasDown) {
              wasDown = false
              soon()
            }
          } else {
            live = false
            wasDown = true
          }
        })
      } catch {
        // Realtime unavailable: the 30-second check still keeps the page current.
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
