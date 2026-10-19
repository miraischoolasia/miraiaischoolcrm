import { parseLocalDate } from '../domain/studentStatus'
import { addDays, toDateKey, type AgendaItem } from './teacherAgenda'

// One class on the Calendar's day list: the Today agenda item plus what the card and the class window show.
export type DayListLesson = AgendaItem & {
  teacherName: string
  // The class's grade or age group (Form 1, Year 5, 9-11 Years), or '' for a class with none.
  grade: string
  // What the class studies (Class Settings > Subjects), or null.
  subject: string | null
  fbGroupUrl: string | null
  zoomLink: string | null
}

// A task, meeting, event or follow-up reminder on the day list (Calendar > Add Task / Meeting / Event, Inbox > Follow up).
export type DayListItem = {
  id: number
  kind: 'task' | 'meeting' | 'event' | 'follow_up'
  title: string
  date: string
  // HH:MM, or null for all day.
  startTime: string | null
  endTime: string | null
  assigneeName: string | null
  isDone: boolean
}

// The classes that start at the same time.
export type DayListSlot = {
  startTime: string
  endTime: string
  lessons: DayListLesson[]
  // Places on the class lists (a child in two classes counts twice).
  places: number
}

export type DayListFilter = {
  grade: string | null
  subject: string | null
  teacherId: number | null
}

export const NO_FILTER: DayListFilter = { grade: null, subject: null, teacherId: null }

export function matchesFilter(lesson: DayListLesson, filter: DayListFilter) {
  return (
    (filter.grade === null || lesson.grade === filter.grade) &&
    (filter.subject === null || lesson.subject === filter.subject) &&
    (filter.teacherId === null || lesson.teacherId === filter.teacherId)
  )
}

// A day's classes by start time; within a time, in the school's grade order, then by name.
export function groupBySlot(lessons: DayListLesson[], gradeOrder: string[] = []): DayListSlot[] {
  const rank = (grade: string) => {
    const index = gradeOrder.indexOf(grade)
    return index === -1 ? gradeOrder.length : index
  }
  const slots = new Map<string, DayListSlot>()
  for (const lesson of lessons) {
    const slot = slots.get(lesson.startTime) ?? { startTime: lesson.startTime, endTime: lesson.endTime, lessons: [], places: 0 }
    slot.lessons.push(lesson)
    slot.places += lesson.studentCount
    if (lesson.endTime > slot.endTime) slot.endTime = lesson.endTime
    slots.set(lesson.startTime, slot)
  }
  return [...slots.values()]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((slot) => ({
      ...slot,
      lessons: [...slot.lessons].sort((a, b) => rank(a.grade) - rank(b.grade) || a.title.localeCompare(b.title) || a.teacherName.localeCompare(b.teacherName)),
    }))
}

// The weeks shown for a month (Sunday first), as date keys. monthKey is "2026-10".
export function monthWeeks(monthKey: string): string[][] {
  const first = parseLocalDate(`${monthKey}-01`)
  let day = addDays(`${monthKey}-01`, -first.getDay())
  const weeks: string[][] = []
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i += 1) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  } while (day.slice(0, 7) === monthKey)
  return weeks
}

export function shiftMonth(monthKey: string, months: number) {
  const date = parseLocalDate(`${monthKey}-01`)
  date.setMonth(date.getMonth() + months)
  return toDateKey(date).slice(0, 7)
}

// How busy a day looks next to the busiest day shown: 0 (no class) to 3.
export function busyLevel(count: number, most: number): 0 | 1 | 2 | 3 {
  if (count <= 0 || most <= 0) return 0
  const share = count / most
  return share > 0.75 ? 3 : share > 0.4 ? 2 : 1
}

// Eight colour sets; a subject always gets the same one (white-label: any school's subjects work).
const TONES = [
  { tag: 'bg-rose-100 text-rose-800', bar: 'bg-rose-400' },
  { tag: 'bg-sky-100 text-sky-800', bar: 'bg-sky-400' },
  { tag: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400' },
  { tag: 'bg-violet-100 text-violet-800', bar: 'bg-violet-500' },
  { tag: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
  { tag: 'bg-orange-100 text-orange-800', bar: 'bg-orange-400' },
  { tag: 'bg-indigo-100 text-indigo-800', bar: 'bg-indigo-400' },
  { tag: 'bg-teal-100 text-teal-800', bar: 'bg-teal-500' },
] as const
const NO_SUBJECT = { tag: 'bg-slate-100 text-slate-700', bar: 'bg-slate-300' }

export function subjectTone(subject: string | null) {
  if (!subject) return NO_SUBJECT
  let hash = 0
  for (const char of subject) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return TONES[hash % TONES.length]
}

// "Form 1" -> "F1", "Year 5" -> "Y5"; anything else stays as it is.
export function shortGrade(grade: string) {
  const match = /^(Form|Year|Standard|Darjah|Tingkatan)\s*(\d+)$/i.exec(grade.trim())
  return match ? `${match[1][0].toUpperCase()}${match[2]}` : grade
}
