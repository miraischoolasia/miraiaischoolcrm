import { parseLocalDate } from '../domain/studentStatus'
import { addMinutesToTime, isScheduleMeetingDate, makeupKey, type MakeupEntry } from './makeup'
import { getLatestLessonLogMap } from './mappers'
import { getScheduleClassKind } from './schedule'
import type {
  Classroom,
  LessonLogSummary,
  Schedule,
  ScheduleException,
} from '../types/domain'

// open: today, attendance not taken yet. missing: a day that has passed with
// no attendance submitted. later: a day after today (view only).
export type AgendaState = 'submitted' | 'open' | 'missing' | 'later'

export type AgendaItem = {
  key: string
  scheduleId: number
  date: string
  title: string
  subtitle: string
  classroomId: number | null
  kind: 'regular' | 'trial' | 'camp' | 'replacement'
  startTime: string
  // Lengthened by a whole-class make-up on that day.
  endTime: string
  makeupMinutes: number
  isMakeupOnly: boolean
  studentCount: number
  log: LessonLogSummary | null
  // 24 hours after the attendance was submitted: when late editing is off, it locks then.
  editableUntil: number | null
  state: AgendaState
  minutes: number
}

export type AgendaSources = {
  teacherId: number
  schedules: Schedule[]
  exceptions: ScheduleException[]
  classroomMap: Map<number, Classroom>
  lessonLogs: LessonLogSummary[]
  makeupEntries: MakeupEntry[]
  // Who is in the class on a day (the attendance roster).
  getRosterIds: (scheduleId: number, date: string) => number[]
}

export type TeacherAgenda = {
  today: AgendaItem[]
  // Days that have passed with no attendance submitted, oldest first.
  todo: AgendaItem[]
  // After today, up to a week ahead.
  upcoming: AgendaItem[]
  week: { classes: number; hours: number }
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function addDays(dateKey: string, days: number) {
  const date = parseLocalDate(dateKey)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

function minutesBetween(start: string, end: string) {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  return endHour * 60 + endMinute - (startHour * 60 + startMinute)
}

// Monday to Sunday around a day.
export function getWeekRange(dateKey: string) {
  const day = parseLocalDate(dateKey).getDay()
  const sinceMonday = (day + 6) % 7
  const start = addDays(dateKey, -sinceMonday)
  return { start, end: addDays(start, 6) }
}

export function getAgendaItems(
  sources: AgendaSources,
  todayString: string,
  fromDate: string,
  toDate: string,
): AgendaItem[] {
  const { teacherId, exceptions, classroomMap, lessonLogs, makeupEntries, getRosterIds } = sources
  const latestLogs = getLatestLessonLogMap(lessonLogs)
  const mine = sources.schedules.filter(
    (schedule) => schedule.teacherId === teacherId && schedule.status === 'active',
  )
  const makeupByDay = new Map<string, MakeupEntry[]>()
  for (const entry of makeupEntries) {
    const key = makeupKey(entry.classroomId, entry.sessionDate)
    makeupByDay.set(key, [...(makeupByDay.get(key) ?? []), entry])
  }

  const items: AgendaItem[] = []

  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    for (const schedule of mine) {
      const classroom = schedule.classroomId ? classroomMap.get(schedule.classroomId) ?? null : null
      let kind: AgendaItem['kind'] = 'replacement'
      let endTime = schedule.endTime
      let makeupMinutes = 0
      let isMakeupOnly = false

      if (schedule.eventType === 'replacement') {
        if (schedule.scheduledDate !== date) {
          continue
        }
      } else {
        kind = getScheduleClassKind(schedule, classroomMap)
        const entries =
          schedule.classroomId !== null && kind !== 'trial'
            ? makeupByDay.get(makeupKey(schedule.classroomId, date)) ?? []
            : []

        if (isScheduleMeetingDate(schedule, date, exceptions, false)) {
          // A whole-class make-up lengthens the day, like on the calendar.
          makeupMinutes = entries
            .filter((entry) => entry.studentId === null)
            .reduce((total, entry) => total + entry.extraMinutes, 0)
          endTime = addMinutesToTime(schedule.endTime, makeupMinutes)
        } else if (
          entries.length > 0 &&
          parseLocalDate(date).getDate() >= 29 &&
          isScheduleMeetingDate(schedule, date, exceptions, true)
        ) {
          // The 29th-31st: the class only meets for a make-up.
          const studentMinutes = new Map<number, number>()
          for (const entry of entries) {
            if (entry.studentId !== null) {
              studentMinutes.set(entry.studentId, (studentMinutes.get(entry.studentId) ?? 0) + entry.extraMinutes)
            }
          }
          const wholeClass = entries
            .filter((entry) => entry.studentId === null)
            .reduce((total, entry) => total + entry.extraMinutes, 0)
          makeupMinutes = Math.max(wholeClass, ...studentMinutes.values())
          endTime = addMinutesToTime(schedule.startTime, makeupMinutes)
          isMakeupOnly = true
        } else {
          continue
        }
      }

      // A class nobody is in cannot take attendance (an empty trial slot).
      const studentCount = getRosterIds(schedule.id, date).length
      if (studentCount === 0) {
        continue
      }

      const log = latestLogs.get(`${schedule.id}:${date}`) ?? null
      const state: AgendaState =
        date > todayString ? 'later' : log ? 'submitted' : date === todayString ? 'open' : 'missing'

      items.push({
        key: `${schedule.id}:${date}`,
        scheduleId: schedule.id,
        date,
        title: classroom?.name ?? schedule.title,
        subtitle:
          kind === 'trial'
            ? 'Trial class'
            : kind === 'replacement'
              ? 'Replacement class'
              : classroom
                ? `${classroom.ageGroup} · ${classroom.programLevel}`
                : '',
        classroomId: schedule.classroomId,
        kind,
        startTime: schedule.startTime,
        endTime,
        makeupMinutes,
        isMakeupOnly,
        studentCount,
        log,
        editableUntil: log ? new Date(log.submittedAt).getTime() + 24 * 60 * 60 * 1000 : null,
        state,
        minutes: minutesBetween(schedule.startTime, endTime),
      })
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
}

export function buildTeacherAgenda(
  sources: AgendaSources,
  todayString: string,
  { lookbackDays = 14, aheadDays = 7 }: { lookbackDays?: number; aheadDays?: number } = {},
): TeacherAgenda {
  const week = getWeekRange(todayString)
  const from = addDays(todayString, -lookbackDays) < week.start ? addDays(todayString, -lookbackDays) : week.start
  const to = addDays(todayString, aheadDays) > week.end ? addDays(todayString, aheadDays) : week.end
  const items = getAgendaItems(sources, todayString, from, to)
  const inWeek = items.filter((item) => item.date >= week.start && item.date <= week.end)

  return {
    today: items.filter((item) => item.date === todayString),
    todo: items.filter((item) => item.state === 'missing' && item.date >= addDays(todayString, -lookbackDays)),
    upcoming: items.filter((item) => item.date > todayString && item.date <= addDays(todayString, aheadDays)),
    week: {
      classes: inWeek.length,
      hours: Math.round((inWeek.reduce((total, item) => total + item.minutes, 0) / 60) * 10) / 10,
    },
  }
}

// "16:00" or "16:00:00" -> "4:00 pm".
export function formatClockTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  const suffix = hour >= 12 ? 'pm' : 'am'
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function atTime(dateKey: string, time: string) {
  const date = parseLocalDate(dateKey)
  const [hour, minute] = time.split(':').map(Number)
  date.setHours(hour, minute, 0, 0)
  return date
}

// Where a class is, compared with now: "in 50 min", "In progress" or "Ended".
export function describeClassTiming(item: Pick<AgendaItem, 'date' | 'startTime' | 'endTime'>, now: Date) {
  const start = atTime(item.date, item.startTime)
  const end = atTime(item.date, item.endTime)
  if (now >= end) {
    return { phase: 'ended' as const, text: 'Ended' }
  }
  if (now >= start) {
    return { phase: 'running' as const, text: 'In progress' }
  }
  const minutes = Math.ceil((start.getTime() - now.getTime()) / 60000)
  const text =
    minutes < 60
      ? `in ${minutes} min`
      : minutes % 60 === 0
        ? `in ${minutes / 60} h`
        : `in ${Math.floor(minutes / 60)} h ${minutes % 60} min`
  return { phase: 'upcoming' as const, text }
}
