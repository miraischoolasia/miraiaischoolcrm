import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { fetchLessonRoom, lessonCheckSeconds, type LessonRoom } from '@/lib/classRoom'
import { malaysiaClock } from '@/lib/lobby'
import { useSession } from '@/lib/session'
import { useLobbyTheme } from '@/lib/useLobby'
import { ClassRoomView } from '@/ui/ClassRoomView'
import { GameWaiting } from '@/ui/GameWaiting'
import { LessonWaiting } from '@/ui/LessonWaiting'

// /class/lesson?date=YYYY-MM-DD&start=HH:MM: a lesson on the timetable, by
// its day and start time. Before the teacher opens it the page waits (and
// checks every 20 s while it is in front); once opened it is the class page.
// It never sends the child to the Zoom app.
export default function LessonPage() {
  const params = useLocalSearchParams<{ date?: string; start?: string }>()
  const date = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null
  const start = typeof params.start === 'string' && /^\d{2}:\d{2}$/.test(params.start) ? params.start : null
  const { child, home, branding, refresh } = useSession()
  const router = useRouter()
  const theme = useLobbyTheme()
  const studentId = child?.studentId ?? null
  const fromHome = home?.schedule?.find((item) => item.date === date && item.start === start) ?? null
  const [room, setRoom] = useState<LessonRoom | null>(null)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const sessionId = room?.sessionId ?? fromHome?.session_id ?? null

  useEffect(() => {
    if (!date || !start || !studentId || sessionId) return
    let cancelled = false
    async function check() {
      try {
        const next = await fetchLessonRoom(studentId as number, date as string, start as string)
        if (cancelled) return
        setRoom(next)
        setProblem(null)
      } catch (failure) {
        if (cancelled) return
        // The school's server cannot say yet: the timetable says it instead.
        setProblem(failure instanceof Error ? failure.message : 'Could not check the lesson.')
        void refresh()
      } finally {
        if (!cancelled) setCheckedAt(new Date())
      }
    }
    void check()
    const timer = setInterval(() => {
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (!hidden && AppState.currentState !== 'background') void check()
    }, lessonCheckSeconds * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [date, start, studentId, sessionId, refresh])

  function back() {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  if (sessionId) return <ClassRoomView sessionId={sessionId} fallbackLink={fromHome?.zoom_link ?? null} />

  const lesson =
    room?.lesson ??
    (fromHome && date
      ? { title: fromHome.title, class: fromHome.class, teacher: fromHome.teacher, date, start: fromHome.start, end: fromHome.end }
      : null)
  const clock = malaysiaClock(new Date())
  const [endHours, endMinutes] = (lesson?.end ?? '23:59').split(':').map(Number)
  const ended = Boolean(date && (date < clock.date || (date === clock.date && clock.minute > endHours * 60 + endMinutes)))

  const shown = {
    lesson,
    ended: ended || !date || !start,
    checkedAt,
    problem: !date || !start ? 'This class link is not right.' : problem,
    everySeconds: lessonCheckSeconds,
    onBack: back,
  }
  // A school with the game lobby gets the game-style page on a computer.
  return theme ? <GameWaiting theme={theme} {...shown} /> : <LessonWaiting color={branding.accentColor} {...shown} />
}
