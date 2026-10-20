import { useEffect, useRef, useState } from 'react'

import { supabase } from './supabase'

// The class page: joining the lesson's Zoom inside the page, and what the
// teacher's live class console shows the class (a copy of the CRM's
// src/lib/classLive.ts ClassLiveState).

export type ScreenPerson = { id: number; name: string }

export type ClassLiveState = {
  title: string
  timer: { endsAt: number | null; pausedLeft: number | null }
  picked: string | null
  // studentId: the child who got the points (their own pop-up shows instead).
  cheer: { id: number; studentId?: number; name: string; points: number; reason: string } | null
  roll: { seq: number; people: ScreenPerson[]; chosenId: number } | null
  star: { seq: number; id: number; name: string } | null
  teams: { key: string; label: string; color: string; text: string; members: ScreenPerson[]; score: number }[] | null
  sentAt: number
}

// Zoom's Meeting SDK join details from the zoom-lesson function (join_sdk).
export type JoinInfo =
  | {
      inPage: true
      joinUrl: string | null
      signature: string
      sdkKey: string
      meetingNumber: string
      password: string
      tk: string | null
      userName: string
      userEmail: string
      customerKey: string
    }
  // Why the class cannot open in the page: no in-page Zoom for the school
  // (no_sdk), a fixed link it cannot read (link_unreadable), or a meeting on
  // another Zoom account (other_account). The link is then a small fallback.
  | { inPage: false; joinUrl: string | null; reason?: 'no_sdk' | 'link_unreadable' | 'other_account' }

async function callZoomLesson(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('zoom-lesson', { body })
  if (error) {
    let reason = error.message
    try {
      const context = (error as { context?: Response }).context
      const answer = context ? await context.json() : null
      if (answer?.error) reason = answer.error
    } catch {
      // keep the general message
    }
    throw new Error(reason || 'Could not open the class.')
  }
  return data as { ok: boolean; error?: string } & Record<string, unknown>
}

// A lesson on the timetable, before or after the teacher opens it.
export type LessonRoom = {
  sessionId: number | null
  lesson: { title: string; class: string | null; teacher: string | null; date: string; start: string; end: string }
}

// How often the waiting page asks whether the teacher has opened the lesson.
export const lessonCheckSeconds = 20

// The class page's waiting room asks whether the teacher has opened the lesson yet.
export async function fetchLessonRoom(studentId: number, lessonDate: string, startTime: string): Promise<LessonRoom> {
  const answer = await callZoomLesson({ action: 'lesson_room', studentId, lessonDate, startTime })
  if (!answer?.ok) throw new Error(answer?.error ?? 'Could not check the lesson.')
  return answer as unknown as LessonRoom
}

export async function fetchJoinInfo(sessionId: number, studentId: number): Promise<JoinInfo> {
  const { data, error } = await supabase.functions.invoke('zoom-lesson', {
    body: { action: 'join_sdk', sessionId, studentId },
  })
  if (error) {
    let reason = error.message
    try {
      const context = (error as { context?: Response }).context
      const answer = context ? await context.json() : null
      if (answer?.error) reason = answer.error
    } catch {
      // keep the general message
    }
    throw new Error(reason || 'Could not open the class.')
  }
  const answer = data as { ok: boolean; error?: string } & JoinInfo
  if (!answer?.ok) throw new Error(answer?.error ?? 'Could not open the class.')
  return answer
}

function readState(value: unknown): ClassLiveState | null {
  if (!value || typeof value !== 'object') return null
  const state = value as Partial<ClassLiveState>
  if (typeof state.title !== 'string' || typeof state.sentAt !== 'number' || !state.timer) return null
  return {
    title: state.title,
    timer: state.timer,
    picked: state.picked ?? null,
    cheer: state.cheer ?? null,
    roll: state.roll ?? null,
    star: state.star ?? null,
    teams: state.teams ?? null,
    sentAt: state.sentAt,
  }
}

// The teacher's class screen, live: the lesson's private broadcast channel
// "class:<session id>". `clockOffset` turns the teacher's times (timer end,
// pick time) into this device's clock.
export function useClassLive(sessionId: number | null) {
  const [state, setState] = useState<ClassLiveState | null>(null)
  const [clockOffset, setClockOffset] = useState(0)
  const [connected, setConnected] = useState(false)
  const lastSent = useRef(0)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    lastSent.current = 0
    const channel = supabase.channel(`class:${sessionId}`, { config: { private: true } })
    channel.on('broadcast', { event: 'screen' }, ({ payload }) => {
      const next = readState(payload)
      // Messages can arrive out of order; keep the newest.
      if (!next || next.sentAt < lastSent.current) return
      lastSent.current = next.sentAt
      setClockOffset(Date.now() - next.sentAt)
      setState(next)
    })
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return
      channel.subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    })
    return () => {
      cancelled = true
      setConnected(false)
      void supabase.removeChannel(channel)
    }
  }, [sessionId])

  return { state, clockOffset, connected }
}
