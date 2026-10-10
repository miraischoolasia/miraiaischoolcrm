import { parseLocalDate } from '../domain/studentStatus'
import type { Classroom, Schedule, ScheduleException } from '../types/domain'
import { weekdayLabels } from './schedule'

// A class being set up (or moved) for a teacher: either a weekly series on a
// weekday, or a single class on one date.
export type ClashCandidate = {
  teacherId: number
  startTime: string
  endTime: string
  excludeScheduleId?: number | null
  // Today, as an ISO date. Days that are over cannot be double-booked any more, so they are not counted.
  today?: string
} & (
  | { kind: 'weekly'; dayOfWeek: number; startRecur: string; endRecur: string | null }
  | { kind: 'single'; date: string }
)

export type TeacherClash = {
  scheduleId: number
  title: string
  // When the existing class meets, e.g. "Wednesday 7:30pm-9:30pm".
  when: string
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours >= 12 ? 'pm' : 'am'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${suffix}`
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)
}

// Date ranges, either end open-ended with null. ISO dates compare as strings.
function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
) {
  return (bEnd === null || aStart <= bEnd) && (aEnd === null || bStart <= aEnd)
}

function weekdayOf(date: string) {
  return parseLocalDate(date).getDay()
}

function isWithin(date: string, start: string | null, end: string | null) {
  return (!start || date >= start) && (!end || date <= end)
}

function isoOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// The first day, today or later, on which both weekly series really meet (the other one is not
// cancelled that day), within the dates both are running. Null when they never do.
function firstSharedDay(
  candidate: { dayOfWeek: number; startRecur: string; endRecur: string | null; today?: string },
  schedule: { startRecur: string | null; endRecur: string | null },
  meets: (date: string) => boolean,
) {
  const from = [candidate.startRecur, schedule.startRecur ?? '', candidate.today ?? ''].reduce((a, b) => (a > b ? a : b))
  const ends = [candidate.endRecur, schedule.endRecur].filter((end): end is string => Boolean(end))
  const to = ends.length > 0 ? ends.reduce((a, b) => (a < b ? a : b)) : null
  const day = parseLocalDate(from)
  while (day.getDay() !== candidate.dayOfWeek) {
    day.setDate(day.getDate() + 1)
  }
  for (let week = 0; week < 60; week += 1) {
    const iso = isoOf(day)
    if (to && iso > to) {
      return null
    }
    if (meets(iso)) {
      return iso
    }
    day.setDate(day.getDate() + 7)
  }
  return null
}

/**
 * The teacher's other classes that overlap the one being set up, so the admin
 * is warned before booking one teacher in two places. Pure: the same rules the
 * calendar uses to place classes, nothing is read from the database.
 *
 * - Cancelled or moved days (schedule exceptions) are free, so a replacement
 *   for a cancelled class never clashes with the class it replaces.
 * - A regular class never meets on the 29th-31st (trial slots do), matching
 *   the four-classes-a-month cap on the calendar.
 */
export function findTeacherClashes(
  candidate: ClashCandidate,
  schedules: Schedule[],
  scheduleExceptions: ScheduleException[],
  classroomMap: Map<number, Classroom>,
): TeacherClash[] {
  if (
    !candidate.startTime ||
    !candidate.endTime ||
    toMinutes(candidate.endTime) <= toMinutes(candidate.startTime)
  ) {
    return []
  }

  const cancelledDays = new Map<number, Set<string>>()
  for (const exception of scheduleExceptions) {
    const days = cancelledDays.get(exception.scheduleId) ?? new Set<string>()
    days.add(exception.exceptionDate)
    cancelledDays.set(exception.scheduleId, days)
  }

  // Whether an existing weekly series really meets on this date.
  function weeklyMeetsOn(schedule: Schedule, date: string) {
    if (schedule.dayOfWeek === null || weekdayOf(date) !== schedule.dayOfWeek) {
      return false
    }

    if (!isWithin(date, schedule.startRecur, schedule.endRecur)) {
      return false
    }

    if (cancelledDays.get(schedule.id)?.has(date)) {
      return false
    }

    const isTrial =
      schedule.classroomId !== null &&
      classroomMap.get(schedule.classroomId)?.category === 'trial'

    return isTrial || parseLocalDate(date).getDate() < 29
  }

  const clashes: TeacherClash[] = []

  for (const schedule of schedules) {
    if (
      schedule.status !== 'active' ||
      schedule.teacherId !== candidate.teacherId ||
      schedule.id === candidate.excludeScheduleId ||
      !timesOverlap(candidate.startTime, candidate.endTime, schedule.startTime, schedule.endTime)
    ) {
      continue
    }

    const timeRange = `${formatTime(schedule.startTime)}-${formatTime(schedule.endTime)}`
    const isWeekly = schedule.eventType === 'regular'
    let when: string | null = null

    if (candidate.kind === 'single') {
      if (isWeekly) {
        if (weeklyMeetsOn(schedule, candidate.date)) {
          when = `${weekdayLabels[weekdayOf(candidate.date)]} ${timeRange}`
        }
      } else if (schedule.scheduledDate === candidate.date) {
        when = `${candidate.date} ${timeRange}`
      }
    } else if (isWeekly) {
      if (
        schedule.dayOfWeek === candidate.dayOfWeek &&
        schedule.startRecur &&
        rangesOverlap(
          candidate.startRecur,
          candidate.endRecur,
          schedule.startRecur,
          schedule.endRecur,
        ) &&
        // A series that has already ended, or only overlapped on days that are over, is no clash.
        firstSharedDay(candidate, schedule, (date) => weeklyMeetsOn(schedule, date)) !== null
      ) {
        when = `${weekdayLabels[candidate.dayOfWeek]} ${timeRange}`
      }
    } else if (
      schedule.scheduledDate !== null &&
      weekdayOf(schedule.scheduledDate) === candidate.dayOfWeek &&
      isWithin(schedule.scheduledDate, candidate.startRecur, candidate.endRecur) &&
      (!candidate.today || schedule.scheduledDate >= candidate.today)
    ) {
      when = `${schedule.scheduledDate} ${timeRange}`
    }

    if (when) {
      clashes.push({ scheduleId: schedule.id, title: schedule.title, when })
    }
  }

  return clashes
}

export function describeClashes(teacherName: string, clashes: TeacherClash[]) {
  return `${teacherName} already has: ${clashes
    .map((clash) => `${clash.title} (${clash.when})`)
    .join('; ')}`
}
