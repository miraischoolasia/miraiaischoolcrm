import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'

import { useSession } from './session'
import { supabase } from './supabase'

// A question the teacher popped in class, for the picked child: read with
// portal_live_state (the CRM's 20261022030000_live_questions.sql), which holds
// back right / wrong and the right answer until the teacher shows it.

export type LiveKind = 'choice' | 'fill' | 'short' | 'screenshot' | 'link'

export type LiveState =
  | { active: false; server_now: string }
  | {
      active: true
      server_now: string
      session: { id: number; class: string | null; questions: number }
      question: {
        id: number
        number: number
        kind: LiveKind
        prompt: string
        options: { text: string }[]
        points: number
        time_limit_seconds: number
        opened_at: string
        closes_at: string
        open: boolean
        revealed: boolean
      }
      answer: {
        text: string | null
        choices: number[] | null
        has_file: boolean
        submitted_at: string
        result: 'correct' | 'wrong' | 'pending' | null
        points: number | null
        feedback: string | null
      } | null
      key: { correct_options: number[] | null; answers: string[]; explanation: string | null } | null
      leaderboard: { place: number; name: string; points: number; me: boolean }[]
      my_points: number
      my_place: number | null
    }

export type LiveAnswerInput = { choices: number[] } | { text: string } | { file: string; text?: string }

export type Picture = { base64: string; mimeType: string }

type LiveValue = {
  state: LiveState | null
  // Seconds left on the open question (0 when it is closed).
  secondsLeft: number
  error: string | null
  submit: (answer: LiveAnswerInput) => Promise<string | null>
  sendPicture: (picture: Picture, note: string) => Promise<string | null>
  reload: () => Promise<void>
}

const LiveContext = createContext<LiveValue | null>(null)

export function choiceLetter(index: number) {
  return String.fromCharCode(65 + index)
}

function decodeBase64(text: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let index = 0
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[index] = (buffer >> bits) & 0xff
      index += 1
    }
  }
  return bytes.slice(0, index)
}

function friendly(message: string) {
  if (/time is up/i.test(message)) return 'Time is up for this question.'
  if (/already answered/i.test(message)) return 'You already answered this question.'
  if (/exceeded|too large|payload/i.test(message)) return 'That picture is too big. Try a smaller one.'
  return message
}

// One subscription for the signed-in login's picked child, shared by every tab.
// On the class page (`sessionId` set) it listens to that lesson's questions
// only and checks every minute instead of every 12 s, so a class of hundreds
// does not keep asking the database.
export function LiveProvider({ children, sessionId = null }: PropsWithChildren<{ sessionId?: number | null }>) {
  const { child, refresh: refreshHome } = useSession()
  const studentId = child?.studentId ?? null
  const [state, setState] = useState<LiveState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Server time minus this device's time, so the countdown matches the teacher's.
  const [offset, setOffset] = useState(0)
  // Questions whose answer was already shown here (their points then reach the home screen).
  const revealedSeen = useRef(new Set<number>())

  const reload = useCallback(async () => {
    if (!studentId) return
    const { data, error: loadError } = await supabase.rpc('portal_live_state', { p_student_id: studentId })
    if (loadError) {
      setError(loadError.message)
      return
    }
    const next = data as LiveState
    setOffset(Date.parse(next.server_now) - Date.now())
    setError(null)
    setState(next)
    if (next.active && next.question.revealed && !revealedSeen.current.has(next.question.id)) {
      revealedSeen.current.add(next.question.id)
      if (next.answer) void refreshHome()
    }
  }, [refreshHome, studentId])

  // A new question or a reveal arrives in real time; polling covers a dropped connection.
  useEffect(() => {
    if (!studentId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => !cancelled && void reload(), 300)
    }
    soon()
    const channel = supabase
      // A fresh name each time: the old channel may still be closing when the screen comes back.
      .channel(`live-${studentId}-${sessionId ?? 'all'}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        sessionId
          ? { event: '*', schema: 'public', table: 'live_questions', filter: `session_id=eq.${sessionId}` }
          : { event: '*', schema: 'public', table: 'live_questions' },
        soon,
      )
      .subscribe()
    const poll = setInterval(soon, sessionId ? 60_000 : 12_000)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [reload, sessionId, studentId])

  const questionOpen = state?.active === true && state.question.open
  const closesAt = state?.active === true ? Date.parse(state.question.closes_at) : 0
  useEffect(() => {
    if (!questionOpen) return
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(tick)
  }, [questionOpen])

  const secondsLeft = questionOpen ? Math.max(0, Math.ceil((closesAt - (now + offset)) / 1000)) : 0

  // Read once more just after the time runs out, so the screen says so.
  useEffect(() => {
    if (!questionOpen) return
    const timer = setTimeout(() => void reload(), Math.max(0, closesAt - (Date.now() + offset)) + 800)
    return () => clearTimeout(timer)
  }, [closesAt, offset, questionOpen, reload])

  const submit = useCallback(
    async (answer: LiveAnswerInput) => {
      if (!studentId || state?.active !== true) return 'There is no question now.'
      const { error: submitError } = await supabase.rpc('submit_live_answer', {
        p_live_question_id: state.question.id,
        p_student_id: studentId,
        p_answer: answer,
      })
      await reload()
      return submitError ? friendly(submitError.message) : null
    },
    [reload, state, studentId],
  )

  const sendPicture = useCallback(
    async (picture: Picture, note: string) => {
      if (!studentId || state?.active !== true) return 'There is no question now.'
      const extension = picture.mimeType === 'image/png' ? 'png' : picture.mimeType === 'image/webp' ? 'webp' : 'jpg'
      const path = `${state.session.id}/${studentId}/${state.question.id}-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('live-answers')
        .upload(path, decodeBase64(picture.base64), { contentType: picture.mimeType, upsert: false })
      if (uploadError) return friendly(uploadError.message)
      return submit(note.trim() ? { file: path, text: note.trim() } : { file: path })
    },
    [state, studentId, submit],
  )

  const value = useMemo<LiveValue>(
    () => ({ state, secondsLeft, error, submit, sendPicture, reload }),
    [error, reload, secondsLeft, sendPicture, state, submit],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive() {
  const value = useContext(LiveContext)
  if (!value) throw new Error('useLive must be used inside LiveProvider')
  return value
}
