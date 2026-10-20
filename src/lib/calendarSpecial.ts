import type { EventInput } from '@fullcalendar/core'
import { shortGrade } from './calendarDayList'
import type { Classroom, MakeupPlan, Schedule, ScheduleException, TrialBooking } from '../types/domain'

// The month calendar shows only the days that differ from the weekly timetable: a cancelled class day, a
// replacement class (made for a cancelled day), an extra class (a one-off class made for no cancelled day) and
// a booked trial. Weekly classes are in the day list and the week view. Both schools work the same way.

export type SpecialKind = 'cancel' | 'replacement' | 'extra' | 'trial'

export type SpecialCard = {
  kind: SpecialKind
  // "7.00–8.15PM"
  time: string
  // The grade and subject ("F2 BIK"), or the class's name when it has no subject.
  line: string
  teacher: string
  // A cancelled day: how it is made up ("Replacement: Sun 12 Oct, 7.00–8.15PM"), or null when nothing is
  // arranged yet.
  madeUp: string | null
}

export const SPECIAL_LABEL: Record<SpecialKind, string> = {
  cancel: 'Cancelled',
  replacement: 'Replacement class',
  extra: 'Extra class',
  trial: 'Trial class',
}

const clock = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return { text: `${hours % 12 || 12}.${String(minutes || 0).padStart(2, '0')}`, meridiem: hours < 12 ? 'AM' : 'PM' }
}

// "19:00", "20:15" → "7.00–8.15PM"; "11:30", "12:30" → "11.30AM–12.30PM".
export function timeRange(start: string, end: string) {
  const from = clock(start)
  const to = clock(end)
  return from.meridiem === to.meridiem
    ? `${from.text}–${to.text}${to.meridiem}`
    : `${from.text}${from.meridiem}–${to.text}${to.meridiem}`
}

// "2026-10-12" → "Mon 12 Oct"
export function shortDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// What a card calls the class: grade and subject when the class has a subject ("F2 BIK"), otherwise its name.
export function classLine(classroom: Classroom | null, subject: string | null, fallback: string) {
  if (classroom && subject) return [shortGrade(classroom.ageGroup ?? ''), subject].filter(Boolean).join(' ')
  return classroom?.name ?? fallback
}

const dayKey = (scheduleId: number, date: string) => `${scheduleId}:${date}`

export type ReplacementLinks = {
  // "<scheduleId>:<date>" of a cancelled day → the replacement class made for it.
  byCancelledDay: Map<string, Schedule>
  // A replacement class → the cancelled day it makes up.
  byReplacement: Map<number, ScheduleException>
}

// Which replacement class makes up which cancelled day: the day dragged to a new date, the replacement saved
// on the day (replacement_schedule_id), or, for one made before that link existed, the note "Add Replacement
// Class" writes: "Makeup for <class> (cancelled <date>)."
export function linkReplacements(
  exceptions: ScheduleException[],
  schedules: Schedule[],
  classroomMap: Map<number, Classroom>,
): ReplacementLinks {
  const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  const replacements = schedules.filter((schedule) => schedule.eventType === 'replacement' && schedule.status === 'active')
  const byCancelledDay = new Map<string, Schedule>()
  const byReplacement = new Map<number, ScheduleException>()

  for (const exception of exceptions) {
    const cancelled = byId.get(exception.scheduleId)
    if (!cancelled) continue
    const linkedId = exception.movedToScheduleId ?? exception.replacementScheduleId ?? null
    let replacement = linkedId !== null ? byId.get(linkedId) ?? null : null
    if (replacement && (replacement.status !== 'active' || replacement.eventType !== 'replacement')) replacement = null
    if (!replacement) {
      const classroom = cancelled.classroomId !== null ? classroomMap.get(cancelled.classroomId) ?? null : null
      const note = `Makeup for ${classroom?.name ?? cancelled.title} (cancelled ${exception.exceptionDate})`
      replacement =
        replacements.find((entry) => !byReplacement.has(entry.id) && (entry.notes ?? '').includes(note)) ?? null
    }
    if (!replacement) continue
    byCancelledDay.set(dayKey(exception.scheduleId, exception.exceptionDate), replacement)
    byReplacement.set(replacement.id, exception)
  }

  return { byCancelledDay, byReplacement }
}

// How a cancelled day is made up: by a replacement class, or by extra minutes on later classes (a whole-class
// make-up plan). Null when nothing is arranged.
export function madeUpText(replacement: Schedule | null, classPlan: MakeupPlan | null) {
  if (replacement?.scheduledDate) {
    return `Replacement: ${shortDate(replacement.scheduledDate)}, ${timeRange(replacement.startTime, replacement.endTime)}`
  }
  if (classPlan && classPlan.sessions.length > 0) {
    const sessions = classPlan.sessions.map((session) => `${shortDate(session.sessionDate)} +${session.extraMinutes} min`)
    return `Made up with extra minutes: ${sessions.join(', ')}`
  }
  return null
}

export type SpecialSources = {
  schedules: Schedule[]
  classroomMap: Map<number, Classroom>
  subjectName: (subjectId: number) => string | null
  links: ReplacementLinks
  makeupPlans: MakeupPlan[]
}

const classroomOf = (schedule: Schedule | undefined, classroomMap: Map<number, Classroom>) =>
  schedule?.classroomId != null ? classroomMap.get(schedule.classroomId) ?? null : null

// The month calendar's events, out of every calendar event: the special class days, each carrying its card
// (extendedProps.special), plus the public holidays. Weekly classes, tasks, meetings and events are left out.
export function monthSpecialEvents(events: EventInput[], sources: SpecialSources): EventInput[] {
  const byId = new Map(sources.schedules.map((schedule) => [schedule.id, schedule]))
  const subject = (classroom: Classroom | null) =>
    classroom?.subjectId != null ? sources.subjectName(classroom.subjectId) : null

  return events.flatMap((event): EventInput[] => {
    const props = (event.extendedProps ?? {}) as Record<string, unknown>
    if (props.isHoliday) return [event]
    const isCancelled = props.isCancelledOccurrence === true
    const isMakeupOnly = props.isMakeupOnly === true
    const isReplacement = props.classKind === 'replacement'
    if (!isCancelled && !isMakeupOnly && !isReplacement) return []

    const schedule = byId.get(Number(props.scheduleId))
    const date = String(props.occurrenceDate ?? String(event.start ?? '').slice(0, 10))
    const start = String(props.startTime ?? schedule?.startTime ?? '')
    const end = isMakeupOnly ? String(event.end ?? '').slice(11, 16) || String(props.endTime ?? '') : String(props.endTime ?? '')
    const teacher = String(props.teacherName ?? '')

    let kind: SpecialKind
    let classroom = classroomOf(schedule, sources.classroomMap)
    let madeUp: string | null = null
    if (isCancelled) {
      kind = 'cancel'
      const replacement = sources.links.byCancelledDay.get(dayKey(Number(props.scheduleId), date)) ?? null
      const classPlan =
        classroom === null
          ? null
          : sources.makeupPlans.find(
              (plan) => plan.classroomId === classroom!.id && plan.missedDate === date && plan.studentId === null,
            ) ?? null
      madeUp = madeUpText(replacement, classPlan)
    } else if (isMakeupOnly) {
      // Make-up minutes on the 29th-31st, when the class does not normally meet.
      kind = 'replacement'
    } else {
      const madeFor = schedule ? sources.links.byReplacement.get(schedule.id) : undefined
      kind = madeFor ? 'replacement' : 'extra'
      // A replacement made from a cancelled day has no class of its own: it is that day's class.
      if (!classroom && madeFor) classroom = classroomOf(byId.get(madeFor.scheduleId), sources.classroomMap)
    }

    const special: SpecialCard = {
      kind,
      time: start && end ? timeRange(start, end) : '',
      line: classLine(classroom, subject(classroom), String(event.title ?? '')),
      teacher,
      madeUp,
    }
    return [{ ...event, extendedProps: { ...props, special } }]
  })
}

// A booked trial is a one-off class for that child, so the month shows it (an empty trial slot is part of the
// weekly timetable and does not show). The slots passed in are the ones the filters show.
export function bookedTrialEvents(
  bookings: TrialBooking[],
  trialSlots: Schedule[],
  exceptions: ScheduleException[],
  classroomMap: Map<number, Classroom>,
  teacherName: (teacherId: number) => string,
): EventInput[] {
  const slots = new Map(trialSlots.map((schedule) => [schedule.id, schedule]))
  const cancelled = new Set(exceptions.map((exception) => dayKey(exception.scheduleId, exception.exceptionDate)))
  const byDay = new Map<string, TrialBooking[]>()
  for (const booking of bookings) {
    if (!slots.has(booking.scheduleId) || cancelled.has(dayKey(booking.scheduleId, booking.bookingDate))) continue
    const key = dayKey(booking.scheduleId, booking.bookingDate)
    byDay.set(key, [...(byDay.get(key) ?? []), booking])
  }

  return [...byDay.values()].map((dayBookings) => {
    const { scheduleId, bookingDate } = dayBookings[0]
    const schedule = slots.get(scheduleId)!
    const classroom = classroomOf(schedule, classroomMap)
    const special: SpecialCard = {
      kind: 'trial',
      time: timeRange(schedule.startTime, schedule.endTime),
      line: `${classroom?.name ?? schedule.title} · ${dayBookings.length} booked`,
      teacher: teacherName(schedule.teacherId),
      madeUp: null,
    }
    return {
      id: `trial-booked-${scheduleId}-${bookingDate}`,
      title: classroom?.name ?? schedule.title,
      start: `${bookingDate}T${schedule.startTime}`,
      end: `${bookingDate}T${schedule.endTime}`,
      startEditable: false,
      extendedProps: {
        scheduleId,
        classroomId: schedule.classroomId,
        classKind: 'trial',
        teacherName: special.teacher,
        eventType: schedule.eventType,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        occurrenceDate: bookingDate,
        special,
      },
    }
  })
}

// The days (YYYY-MM-DD) that have something on the month calendar; every other day says so.
export function busyDays(events: EventInput[]) {
  return new Set(events.map((event) => String(event.start ?? '').slice(0, 10)).filter(Boolean))
}
