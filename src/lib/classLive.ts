import { useEffect, useRef } from 'react'
import type { ClassScreenState } from './classScreen'
import { supabase } from './supabase'

// The live class console also sends what the class screen shows to every
// child's class page in the student app, over Supabase Realtime Broadcast:
// one private channel per lesson, "class:<session id>". Only staff who run
// the lesson may send and only the lesson's children (and their parents) may
// listen (realtime.messages policies, 20261024700000_class_live_channel.sql).
// Nothing is stored.

// What the children's page gets: no question (they have their own card) and
// no leaderboard; first names and face ids only, as on the class screen.
export type ClassLiveState = Pick<ClassScreenState, 'title' | 'timer' | 'picked' | 'cheer' | 'roll' | 'star' | 'teams'> & {
  sentAt: number
}

export const classLiveTopic = (sessionId: number) => `class:${sessionId}`

export function classLiveState(state: Omit<ClassScreenState, 'sentAt'>): Omit<ClassLiveState, 'sentAt'> {
  return {
    title: state.title,
    timer: state.timer,
    picked: state.picked,
    cheer: state.cheer ?? null,
    roll: state.roll ?? null,
    star: state.star ?? null,
    teams: state.teams ?? null,
  }
}

// A child who opens the page late still gets the state within this time.
const RESEND_MS = 60_000

// Sends when what the children see changes, and again once a minute; never
// the 2-second heartbeat the class screen window uses (that would be one
// message a child every 2 s in a class of hundreds).
export function useClassLiveBroadcast(sessionId: number | null, state: Omit<ClassScreenState, 'sentAt'>) {
  const payload = JSON.stringify(classLiveState(state))
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const readyRef = useRef(false)
  const latest = useRef(payload)
  const lastSent = useRef<string | null>(null)

  const send = useRef(() => {
    const channel = channelRef.current
    if (!channel || !readyRef.current) return
    lastSent.current = latest.current
    void channel.send({ type: 'broadcast', event: 'screen', payload: { ...JSON.parse(latest.current), sentAt: Date.now() } })
  })

  useEffect(() => {
    const client = supabase
    if (!client || !sessionId) return
    let cancelled = false
    readyRef.current = false
    lastSent.current = null
    const channel = client.channel(classLiveTopic(sessionId), { config: { private: true, broadcast: { self: false } } })
    channelRef.current = channel
    void client.realtime.setAuth().then(() => {
      if (cancelled) return
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        readyRef.current = true
        send.current()
      })
    })
    const resend = setInterval(() => send.current(), RESEND_MS)
    return () => {
      cancelled = true
      clearInterval(resend)
      readyRef.current = false
      channelRef.current = null
      void client.removeChannel(channel)
    }
  }, [sessionId])

  useEffect(() => {
    latest.current = payload
    if (payload === lastSent.current) return
    // A burst of changes (a pick, then the cheer) goes out as one message.
    const timer = setTimeout(() => send.current(), 150)
    return () => clearTimeout(timer)
  }, [payload])
}
