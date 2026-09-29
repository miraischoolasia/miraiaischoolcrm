import { parseLocalDate } from '../domain/studentStatus'
import type { MakeupPlan, Schedule, ScheduleException } from '../types/domain'

// One make-up session flattened with its plan, for calendar/attendance lookups.
export type MakeupEntry = {
  planId: number
  classroomId: number
  missedDate: string
  studentId: number | null
  sessionDate: string
  extraMinutes: number
}

export const makeupPresets = [
  { count: 2, minutes: 30 },
  { count: 4, minutes: 15 },
  { count: 1, minutes: 60 },
] as const

export function makeupKey(classroomId: number, date: string) {
  return `${classroomId}:${date}`
}

export function flattenMakeupPlans(plans: MakeupPlan[]): MakeupEntry[] {
  return plans.flatMap((plan) =>
    plan.sessions.map((session) => ({
      planId: plan.id,
      classroomId: plan.classroomId,
      missedDate: plan.missedDate,
      studentId: plan.studentId,
      sessionDate: session.sessionDate,
      extraMinutes: session.extraMinutes,
    })),
  )
}

export function buildMakeupMap(entries: MakeupEntry[]) {
  const map = new Map<string, MakeupEntry[]>()

  for (const entry of entries) {
    const key = makeupKey(entry.classroomId, entry.sessionDate)
    const existing = map.get(key) ?? []
    existing.push(entry)
    map.set(key, existing)
  }

  return map
}

export function sumMakeupMinutes(sessions: { extraMinutes: number }[]) {
  return sessions.reduce((total, session) => total + session.extraMinutes, 0)
}

// "19:30" or "19:30:00" plus minutes -> "20:00".
export function addMinutesToTime(time: string, minutes: number) {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + minutes
  const nextHour = Math.floor(total / 60) % 24
  const nextMinute = total % 60
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`
}

function addDays(dateKey: string, days: number) {
  const date = parseLocalDate(dateKey)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Mirrors save_makeup_plan's check: the weekly class runs that day (its
// weekday, inside its range, not cancelled). The 29th-31st only count when
// allowMonthEnd is set - a make-up may use them, a normal class never does.
export function isScheduleMeetingDate(
  schedule: Schedule,
  dateKey: string,
  exceptions: ScheduleException[],
  allowMonthEnd: boolean,
) {
  if (
    schedule.status !== 'active' ||
    schedule.eventType !== 'regular' ||
    schedule.dayOfWeek === null ||
    !schedule.startRecur
  ) {
    return false
  }

  const date = parseLocalDate(dateKey)

  return (
    date.getDay() === schedule.dayOfWeek &&
    dateKey >= schedule.startRecur &&
    (!schedule.endRecur || dateKey <= schedule.endRecur) &&
    (allowMonthEnd || date.getDate() < 29) &&
    !exceptions.some(
      (exception) =>
        exception.scheduleId === schedule.id && exception.exceptionDate === dateKey,
    )
  )
}

// The next `count` normal class days of a classroom after `afterDate`, used
// to prefill "the next two classes". Skips cancelled days and the 29th-31st.
export function getUpcomingClassDates(
  classroomSchedules: Schedule[],
  exceptions: ScheduleException[],
  afterDate: string,
  count: number,
) {
  const dates: string[] = []
  let cursor = afterDate

  // A year of days is far more than any weekly class needs to yield `count`.
  for (let step = 0; step < 366 && dates.length < count; step += 1) {
    cursor = addDays(cursor, 1)

    if (
      classroomSchedules.some((schedule) =>
        isScheduleMeetingDate(schedule, cursor, exceptions, false),
      )
    ) {
      dates.push(cursor)
    }
  }

  return dates
}
