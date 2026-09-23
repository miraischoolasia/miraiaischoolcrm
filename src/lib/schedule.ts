import type { EventInput } from '@fullcalendar/core'
import { parseLocalDate } from '../domain/studentStatus'
import type {
  Classroom,
  Schedule,
  ScheduleException,
  ScheduleFormState,
  Student,
  Teacher,
  TrialBooking,
} from '../types/domain'

export const weekdayLabels = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
export const weekdayToRRule = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const

export type CalendarClassFilter = 'all' | 'regular' | 'trial' | 'replacement'

export const calendarClassFilterOptions: { value: CalendarClassFilter; label: string }[] = [
  { value: 'all', label: 'All Classes' },
  { value: 'regular', label: 'Regular Class' },
  { value: 'trial', label: 'Trial Class' },
  { value: 'replacement', label: 'Replacement Class' },
]

// A weekly schedule takes its kind from the classroom it is bound to
// (regular vs trial); replacement classes have no classroom and stand alone.
export function getScheduleClassKind(
  schedule: Schedule,
  classroomMap: Map<number, Classroom>,
): Exclude<CalendarClassFilter, 'all'> {
  if (schedule.eventType === 'replacement') {
    return 'replacement'
  }

  const classroom = schedule.classroomId ? classroomMap.get(schedule.classroomId) : null
  return classroom?.category === 'trial' ? 'trial' : 'regular'
}

export function filterSchedulesByClassKind(
  schedules: Schedule[],
  classroomMap: Map<number, Classroom>,
  filter: CalendarClassFilter,
) {
  if (filter === 'all') {
    return schedules
  }

  return schedules.filter(
    (schedule) => getScheduleClassKind(schedule, classroomMap) === filter,
  )
}

export function getTrialSlotKey(scheduleId: number, dateKey: string) {
  return `${scheduleId}:${dateKey}`
}

// Bookings grouped by trial slot and day, so the calendar can tell an empty
// (available) occurrence from one with children booked.
export function buildTrialBookingMap(bookings: TrialBooking[]) {
  const bookingMap = new Map<string, TrialBooking[]>()

  for (const booking of bookings) {
    const key = getTrialSlotKey(booking.scheduleId, booking.bookingDate)
    const existing = bookingMap.get(key) ?? []
    existing.push(booking)
    bookingMap.set(key, existing)
  }

  return bookingMap
}

export function getDateKeyFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildScheduleFormState(
  schedule: Schedule | null,
  todayString: string,
  defaultTeacherId: number | null,
  participantIds: string[],
): ScheduleFormState {
  if (!schedule) {
    return {
      title: '',
      teacherId: defaultTeacherId ? String(defaultTeacherId) : '',
      classroomId: '',
      eventType: 'regular',
      dayOfWeek: String(parseLocalDate(todayString).getDay()),
      scheduledDate: todayString,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: todayString,
      endRecur: '',
      notes: '',
      participantIds,
    }
  }

  return {
    title: schedule.title,
    teacherId: String(schedule.teacherId),
    classroomId: schedule.classroomId ? String(schedule.classroomId) : '',
    eventType: schedule.eventType,
    dayOfWeek:
      schedule.dayOfWeek !== null ? String(schedule.dayOfWeek) : String(parseLocalDate(todayString).getDay()),
    scheduledDate: schedule.scheduledDate ?? todayString,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    startRecur: schedule.startRecur ?? todayString,
    endRecur: schedule.endRecur ?? '',
    notes: schedule.notes ?? '',
    participantIds,
  }
}

// An exception only counts while it still lines up with the weekly series.
// Editing the weekday or the start/end dates can leave old rows pointing at
// days the class no longer runs; those must not render as cancelled cards.
function isExceptionOnSchedule(schedule: Schedule, exception: ScheduleException) {
  const date = exception.exceptionDate

  return (
    parseLocalDate(date).getDay() === schedule.dayOfWeek &&
    (!schedule.startRecur || date >= schedule.startRecur) &&
    (!schedule.endRecur || date <= schedule.endRecur)
  )
}

export function calculateDuration(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  const totalMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function buildScheduleEvents(
  schedules: Schedule[],
  classroomMap: Map<number, Classroom>,
  classroomStudentMap: Map<number, Student[]>,
  teacherMap: Map<number, Teacher>,
  scheduleParticipantMap: Map<number, number[]>,
  studentMap: Map<number, Student>,
  scheduleExceptions: ScheduleException[] = [],
): EventInput[] {
  const exceptionsByScheduleId = new Map<number, ScheduleException[]>()

  for (const exception of scheduleExceptions) {
    const existing = exceptionsByScheduleId.get(exception.scheduleId) ?? []
    existing.push(exception)
    exceptionsByScheduleId.set(exception.scheduleId, existing)
  }

  return schedules
    .filter((schedule) => schedule.status === 'active')
    .flatMap((schedule): EventInput[] => {
      const teacher = teacherMap.get(schedule.teacherId)
      const classroom = schedule.classroomId ? classroomMap.get(schedule.classroomId) : null
      const participantNames =
        schedule.eventType === 'regular'
          ? (classroom && classroomStudentMap.get(classroom.id)
              ? classroomStudentMap.get(classroom.id)!
              : []
            )
              .map((student) => student.name)
              .join(', ')
          : (scheduleParticipantMap.get(schedule.id) ?? [])
              .map((studentId) => studentMap.get(studentId)?.name)
              .filter(Boolean)
              .join(', ')

      const shared = {
        id: `schedule-${schedule.id}`,
        title: classroom?.name ?? schedule.title,
        duration: calculateDuration(schedule.startTime, schedule.endTime),
        extendedProps: {
          scheduleId: schedule.id,
          classroomId: schedule.classroomId,
          classKind: getScheduleClassKind(schedule, classroomMap),
          teacherName: teacher?.fullName ?? 'Unknown Teacher',
          participantNames: participantNames || 'No students assigned',
          eventType: schedule.eventType,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          notes: schedule.notes ?? '',
        },
      }

      if (schedule.eventType === 'regular') {
        const dtstart = `${schedule.startRecur}T${schedule.startTime}`
        const until = schedule.endRecur ? `${schedule.endRecur}T23:59:59` : undefined

        const exceptions = (exceptionsByScheduleId.get(schedule.id) ?? []).filter(
          (exception) => isExceptionOnSchedule(schedule, exception),
        )

        // A single skipped day is an rrule `exdate` on the weekly series, which
        // must carry the same time-of-day as dtstart to match an occurrence.
        const recurringEvent: EventInput = {
          ...shared,
          ...(exceptions.length > 0
            ? {
                exdate: exceptions.map(
                  (exception) => `${exception.exceptionDate}T${schedule.startTime}`,
                ),
              }
            : {}),
          rrule: {
            freq: 'weekly',
            byweekday:
              schedule.dayOfWeek !== null
                ? [weekdayToRRule[schedule.dayOfWeek]]
                : [],
            dtstart,
            ...(until ? { until } : {}),
          },
          // Every regular class only meets 4 times a month: the 5th weekly
          // occurrence in a month (when it exists) always lands on the 29th,
          // 30th, or 31st, so excluding those calendar dates caps every
          // weekly schedule at exactly 4 classes per month. Trial slots are
          // offered every week, so they are not capped.
          ...(getScheduleClassKind(schedule, classroomMap) === 'trial'
            ? {}
            : {
                exrule: {
                  freq: 'daily',
                  bymonthday: [29, 30, 31],
                  dtstart,
                  ...(until ? { until } : {}),
                },
              }),
        }

        // Skipped days stay visible as a struck-through card so an admin can
        // restore them.
        const cancelledEvents: EventInput[] = exceptions.map((exception) => ({
          id: `schedule-${schedule.id}-cancelled-${exception.exceptionDate}`,
          title: shared.title,
          start: `${exception.exceptionDate}T${schedule.startTime}`,
          end: `${exception.exceptionDate}T${schedule.endTime}`,
          extendedProps: {
            ...shared.extendedProps,
            isCancelledOccurrence: true,
            occurrenceDate: exception.exceptionDate,
            cancelReason: exception.reason ?? '',
          },
        }))

        return [recurringEvent, ...cancelledEvents]
      }

      return [
        {
          ...shared,
          start: `${schedule.scheduledDate}T${schedule.startTime}`,
          end: `${schedule.scheduledDate}T${schedule.endTime}`,
        },
      ]
    })
}
