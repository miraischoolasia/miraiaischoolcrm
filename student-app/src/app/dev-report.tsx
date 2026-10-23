import { Redirect, useLocalSearchParams } from 'expo-router'

import { englishReportWords, type LessonReport } from '@/lib/lessonReport'
import { lobbyThemes } from '@/lib/lobbyThemes'
import type { UpcomingClass } from '@/lib/portal'
import { LessonEndReport } from '@/ui/LessonEndReport'

// Development only (npx expo start): the lesson report with made-up data, to
// look at it without a login. ?state=top (all right, first) | writing (remarks
// not written yet) | one (one right) | missed; ?theme=eduhero (Chinese, sea) or
// none (English, the school colour). The built app sends this page to Home.
export default function DevReport() {
  const params = useLocalSearchParams<{ state?: string; theme?: string }>()
  if (!__DEV__) return <Redirect href="/" />
  const theme = params.theme === 'none' ? undefined : lobbyThemes.eduhero
  const state = params.state ?? 'top'
  const base: LessonReport = {
    session_id: 1,
    date: '2026-10-22',
    start: '19:00',
    end: '20:15',
    title: 'Y5 BM',
    class: 'Y5 BM · Bahasa Melayu',
    classroom_id: 1,
    teacher: 'Cikgu Aina',
    has_zoom: true,
    zoom_minutes: 75,
    lesson_minutes: 75,
    late_minutes: 0,
    attended: true,
    attendance: 'present',
    questions: 5,
    answered: 5,
    right: 5,
    previous_right: 3,
    points: 48,
    place: 1,
    point_items: [
      { reason: 'question', kind: 'question', emoji: null, points: 40 },
      { reason: 'Great answer', kind: 'award', emoji: '🌟', points: 5 },
      { reason: 'Helping others', kind: 'award', emoji: '🤝', points: 3 },
    ],
    teacher_words: ['Aiden explained his answer to the class. Great confidence today!'],
    attendance_sent: true,
  }
  const report: LessonReport =
    state === 'writing'
      ? { ...base, attendance_sent: false, teacher_words: [] }
      : state === 'one'
        ? { ...base, right: 1, points: 8, place: 9, previous_right: 0, late_minutes: 8, zoom_minutes: 61, point_items: [{ reason: 'question', kind: 'question', emoji: null, points: 8 }] }
        : state === 'missed'
          ? { ...base, attended: false, zoom_minutes: 0, right: 0, answered: 0, points: 0, place: null, point_items: [], teacher_words: [], attendance: 'absent' }
          : base
  const next: UpcomingClass = { date: '2026-10-29', start: '19:00', end: '20:15', title: 'Y5 BM', class: 'Y5 BM · Bahasa Melayu', teacher: 'Cikgu Aina', zoom_link: null }
  return (
    <LessonEndReport
      report={report}
      childName="Aiden"
      words={theme?.report ?? englishReportWords}
      color={theme ? '#f97316' : '#fc0c97'}
      background={null}
      next={next}
      today="2026-10-22"
      onHome={() => undefined}
      onQuestions={() => undefined}
      onVideos={() => undefined}
    />
  )
}
