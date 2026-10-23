// The student's lesson report (design A, "game result"): the words and sums,
// with no database in them (tested in lessonReport.test.ts).

import type { UpcomingClass } from './portal'

export type PointItem = { reason: string; kind: string; emoji: string | null; points: number }

export type LessonReport = {
  session_id: number
  date: string
  start: string
  end: string
  title: string | null
  class: string | null
  classroom_id: number | null
  teacher: string | null
  has_zoom: boolean
  zoom_minutes: number | null
  lesson_minutes: number
  late_minutes: number | null
  attended: boolean
  attendance: 'present' | 'absent' | 'leave' | null
  questions: number
  answered: number
  right: number
  previous_right: number | null
  // Null when the school does not show points (or remarks) to this login.
  points: number | null
  place: number | null
  point_items: PointItem[] | null
  teacher_words: string[] | null
  attendance_sent: boolean
}

export type ReportWords = {
  back: string
  missedTitle: string
  missedText: string
  watchVideo: string
  title: string
  pointsToday: string
  place: (place: number) => string
  right: string
  onTime: string
  arrival: string
  late: (minutes: number) => string
  minutesIn: string
  whereFrom: string
  rightAnswers: string
  writing: string
  nextLesson: (day: string, time: string) => string
  inDays: (days: number) => string
  today: string
  tomorrow: string
  home: string
  seeQuestions: string
  weekdays: string[]
  months: string[]
}

export const englishReportWords: ReportWords = {
  back: 'Home',
  missedTitle: 'You missed this class',
  missedText: 'That is OK! The class video goes to the videos page; watch it when you can, and see you next time.',
  watchVideo: 'Watch the class videos',
  title: 'Class over! Well done',
  pointsToday: 'points today',
  place: (place) => `No. ${place} in the class!`,
  right: 'right',
  onTime: 'On time',
  arrival: 'arrival',
  late: (minutes) => `${minutes} min late`,
  minutesIn: 'minutes in class',
  whereFrom: 'Where the points came from',
  rightAnswers: 'Right answers',
  writing: 'Your teacher is still writing about today. Come back a bit later.',
  nextLesson: (day, time) => `Next class: ${day} ${time}`,
  inDays: (days) => `in ${days} days`,
  today: 'today',
  tomorrow: 'tomorrow',
  home: 'Back home',
  seeQuestions: "See today's questions and answers",
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
}

// The title: the same for every child who came (no stars, no comparing).
export function reportTitle(report: Pick<LessonReport, 'attended'>, words: ReportWords) {
  return report.attended ? words.title : words.missedTitle
}

// Under the points: the place, only for the top three (nothing else).
export function reportBadge(report: Pick<LessonReport, 'place'>, words: ReportWords) {
  if (report.place !== null && report.place >= 1 && report.place <= 3) return { kind: 'place' as const, text: words.place(report.place) }
  return null
}

export function lateText(report: Pick<LessonReport, 'late_minutes'>, words: ReportWords) {
  return report.late_minutes !== null && report.late_minutes >= 5 ? words.late(report.late_minutes) : words.onTime
}

// The points list: every right answer as one line, the awards each on their own.
export function pointLines(items: PointItem[] | null, words: ReportWords) {
  return (items ?? []).map((item) => ({
    label: item.kind === 'question' ? words.rightAnswers : item.reason,
    emoji: item.kind === 'question' ? '✅' : (item.emoji ?? '⭐'),
    points: item.points,
  }))
}

// The class's next lesson on the child's timetable after this one (same class name).
export function nextLessonOf(report: Pick<LessonReport, 'date' | 'start' | 'class' | 'title'>, schedule: UpcomingClass[] | undefined) {
  const after = `${report.date} ${report.start}`
  return (
    (schedule ?? [])
      .filter((item) => (item.class ?? item.title) === (report.class ?? report.title) && `${item.date} ${item.start.slice(0, 5)}` > after)
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))[0] ?? null
  )
}

// "Thu 7:00 pm", the day number, month, and how many days away.
export function nextLessonLabel(item: UpcomingClass, todayIso: string, words: ReportWords) {
  const [year, month, day] = item.date.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const [hours, minutes] = item.start.split(':').map(Number)
  const time = `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'pm' : 'am'}`
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const days = Math.round((date.getTime() - Date.UTC(ty, tm - 1, td)) / 86400000)
  return {
    line: words.nextLesson(words.weekdays[date.getUTCDay()], time),
    day,
    month: words.months[month - 1],
    away: days <= 0 ? words.today : days === 1 ? words.tomorrow : words.inDays(days),
  }
}
