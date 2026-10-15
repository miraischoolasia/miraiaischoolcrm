import type { Classroom, Schedule, Student, Teacher, TrialBooking } from '../types/domain'
import { cleanHoaTitle, describeHoaSlot } from './hoaSlots'

// One class a student is signed up for, as the side panel of the chat shows it.
export type StudentClassLine = {
  title: string
  // "Thu, 17:00 to 19:00" for a weekly class, "Sat 18 Oct, 10:00 to 12:00" for an HOA class.
  when: string
  teacher: string | null
  zoomLink: string | null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Sources = {
  student: Student
  classrooms: Classroom[]
  schedules: Schedule[]
  teachers: Pick<Teacher, 'id' | 'fullName'>[]
  trialBookings: TrialBooking[]
  // Today as YYYY-MM-DD: the next HOA class on or after it is the one shown.
  today: string
}

// The classes a student attends: the weekly times of the class they are in, and the HOA class they
// booked (the next one, else the last).
export function classesOfStudent({ student, classrooms, schedules, teachers, trialBookings, today }: Sources): StudentClassLine[] {
  const teacherName = (id: number | null | undefined) =>
    id === null || id === undefined ? null : (teachers.find((teacher) => teacher.id === id)?.fullName ?? null)
  const lines: StudentClassLine[] = []

  const classroom = student.classroomId === null ? undefined : classrooms.find((entry) => entry.id === student.classroomId)
  if (classroom) {
    const weekly = schedules
      .filter(
        (schedule) =>
          schedule.classroomId === classroom.id &&
          schedule.status === 'active' &&
          schedule.eventType === 'regular' &&
          schedule.recurrenceType === 'weekly' &&
          schedule.dayOfWeek !== null,
      )
      .sort((a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || a.startTime.localeCompare(b.startTime))
    if (weekly.length === 0) {
      lines.push({
        title: cleanHoaTitle(classroom.name),
        when: 'Time not set yet',
        teacher: teacherName(classroom.teacherId),
        zoomLink: classroom.zoomLink ?? null,
      })
    }
    for (const schedule of weekly) {
      lines.push({
        title: cleanHoaTitle(classroom.name),
        when: `${WEEKDAYS[schedule.dayOfWeek ?? 0]}, ${schedule.startTime.slice(0, 5)} to ${schedule.endTime.slice(0, 5)}`,
        teacher: teacherName(classroom.teacherId ?? schedule.teacherId),
        zoomLink: classroom.zoomLink ?? null,
      })
    }
  }

  const bookings = trialBookings
    .filter((booking) => booking.studentId === student.id)
    .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))
  const booking = bookings.find((entry) => entry.bookingDate >= today) ?? bookings[bookings.length - 1]
  if (booking) {
    const schedule = schedules.find((entry) => entry.id === booking.scheduleId)
    if (schedule) {
      const room = schedule.classroomId === null ? undefined : classrooms.find((entry) => entry.id === schedule.classroomId)
      lines.push({
        title: cleanHoaTitle(schedule.title),
        when: describeHoaSlot({
          date: booking.bookingDate,
          startTime: schedule.startTime.slice(0, 5),
          endTime: schedule.endTime.slice(0, 5),
        }),
        teacher: teacherName(schedule.teacherId),
        zoomLink: room?.zoomLink ?? null,
      })
    }
  }

  return lines
}
