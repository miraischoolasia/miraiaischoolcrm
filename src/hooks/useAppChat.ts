import { useCallback, useEffect, useRef, useState } from 'react'
import { appChatUnread, fetchAppChatOn, fetchAppChatThreads, type AppChatThread } from '../lib/appChat'
import { supabase } from '../lib/supabase'

const REFRESH_MS = 60_000

// The student app chat threads this login may read, kept fresh live (and once
// a minute in case the live link drops). `on` is the school's switch; with it
// off there are no threads and nothing listens.
export function useAppChat(enabled: boolean) {
  const [on, setOn] = useState(false)
  const [threads, setThreads] = useState<AppChatThread[]>([])
  const [loaded, setLoaded] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) return
    try {
      const isOn = await fetchAppChatOn()
      if (!alive.current) return
      setOn(isOn)
      setThreads(isOn ? await fetchAppChatThreads() : [])
    } catch {
      // Keep what is shown.
    } finally {
      if (alive.current) setLoaded(true)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    const first = window.setTimeout(() => void reload(), 0)
    const timer = window.setInterval(() => {
      if (!document.hidden) void reload()
    }, REFRESH_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [enabled, reload])

  useEffect(() => {
    if (!enabled || !on || !supabase) return undefined
    const client = supabase
    let soon: number | undefined
    const channel = client
      .channel(`app-chat-staff-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_chat_threads' }, () => {
        window.clearTimeout(soon)
        soon = window.setTimeout(() => void reload(), 300)
      })
      .subscribe()
    return () => {
      window.clearTimeout(soon)
      void client.removeChannel(channel)
    }
  }, [enabled, on, reload])

  return { on: enabled && on, threads: enabled && on ? threads : [], loaded, unread: enabled && on ? appChatUnread(threads) : 0, reload }
}

export type AppChatState = ReturnType<typeof useAppChat>
