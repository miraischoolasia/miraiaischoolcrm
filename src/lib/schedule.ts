import type { EventInput } from '@fullcalendar/core'
import { parseLocalDate } from '../domain/studentStatus'
import type { Classroom, Schedule, ScheduleFormState, Student, Teacher } from '../types/domain'

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
): EventInput[] {
  return schedules
    .filter((schedule) => schedule.status === 'active')
    .map((schedule) => {
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

        return {
          ...shared,
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
          // weekly schedule at exactly 4 classes per month.
          exrule: {
            freq: 'daily',
            bymonthday: [29, 30, 31],
            dtstart,
            ...(until ? { until } : {}),
          },
        }
      }

      return {
        ...shared,
        start: `${schedule.scheduledDate}T${schedule.startTime}`,
        end: `${schedule.scheduledDate}T${schedule.endTime}`,
      }
    })
}
