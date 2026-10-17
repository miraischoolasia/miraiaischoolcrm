import { weekdayLabels } from './schedule'
import { formatClockTime } from './teacherAgenda'
import { getStudentClassIds } from './roster'
import { teachesClassroom } from './classroomTeachers'
import type { StudentRow } from './studentRows'
import type { Classroom, Schedule, TrialBooking } from '../types/domain'

// What the admin's Teacher details shows of one class: when it meets, who is in it, where it meets
// on Zoom. Kept apart from the screen so the rules are tested.
export type TeacherClassCard = {
  classroom: Classroom
  // "Tue 8:30 pm-10:00 pm", one per weekly time of this teacher in the class.
  slots: string[]
  // A trial (HOA) class lists the children booked from today on; the others, who is in the class now.
  students: StudentRow[]
  isTrialSlot: boolean
  // Regular classes are one group; HOA (trial) slots and holiday camps are the other courses.
  group: 'regular' | 'other'
}

// Monday is 0 and Sunday 6, so the week reads in the order it is lived; a class with no weekly time
// goes last.
function weekOrder(schedule: Schedule) {
  if (schedule.dayOfWeek === null) {
    return Number.MAX_SAFE_INTEGER
  }
  const day = (schedule.dayOfWeek + 6) % 7
  const [hour, minute] = schedule.startTime.split(':').map(Number)
  return day * 24 * 60 + hour * 60 + minute
}

function slotText(schedule: Schedule) {
  const day = schedule.dayOfWeek === null ? '' : `${weekdayLabels[schedule.dayOfWeek].slice(0, 3)} `
  return `${day}${formatClockTime(schedule.startTime)}-${formatClockTime(schedule.endTime)}`
}

export function buildTeacherClasses({
  teacherId,
  classrooms,
  schedules,
  studentRows,
  trialBookings,
  todayString,
}: {
  teacherId: number
  classrooms: Classroom[]
  schedules: Schedule[]
  studentRows: StudentRow[]
  trialBookings: TrialBooking[]
  todayString: string
}): TeacherClassCard[] {
  const mine = schedules.filter(
    (schedule) => schedule.teacherId === teacherId && schedule.status === 'active' && schedule.classroomId !== null,
  )
  const classroomIds = new Set(mine.map((schedule) => schedule.classroomId as number))
  for (const classroom of classrooms) {
    if (teachesClassroom(classroom, teacherId)) {
      classroomIds.add(classroom.id)
    }
  }

  const rowByStudent = new Map(studentRows.map((row) => [row.student.id, row]))
  const cards: TeacherClassCard[] = []
  // Where each class sits in the week.
  const order = new Map<number, number>()

  for (const classroom of classrooms) {
    if (!classroomIds.has(classroom.id) || classroom.status !== 'active') {
      continue
    }
    const slots = mine
      .filter((schedule) => schedule.classroomId === classroom.id && schedule.eventType === 'regular' && schedule.dayOfWeek !== null)
      .sort((a, b) => (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) || a.startTime.localeCompare(b.startTime))
      .map(slotText)
    const isTrialSlot = classroom.category === 'trial'

    let students: StudentRow[]
    if (isTrialSlot) {
      const scheduleIds = new Set(
        schedules.filter((schedule) => schedule.classroomId === classroom.id).map((schedule) => schedule.id),
      )
      const seen = new Set<number>()
      students = []
      for (const booking of trialBookings) {
        if (!scheduleIds.has(booking.scheduleId) || booking.bookingDate < todayString || booking.studentId === null) {
          continue
        }
        const row = rowByStudent.get(booking.studentId)
        if (row && !seen.has(row.student.id)) {
          seen.add(row.student.id)
          students.push(row)
        }
      }
    } else {
      students = studentRows.filter((row) => row.student.isActive && getStudentClassIds(row.student).includes(classroom.id))
    }
    students.sort((a, b) => a.student.name.localeCompare(b.student.name))
    const first = Math.min(
      ...mine
        .filter((schedule) => schedule.classroomId === classroom.id && schedule.eventType === 'regular')
        .map(weekOrder),
      Number.MAX_SAFE_INTEGER,
    )
    order.set(classroom.id, first)
    cards.push({ classroom, slots, students, isTrialSlot, group: classroom.category === 'regular' ? 'regular' : 'other' })
  }

  // Regular classes first, then the other courses. Each group runs through the week, Monday to
  // Sunday and early to late; two classes at the same time put the fuller one first.
  return cards.sort(
    (a, b) =>
      Number(a.group === 'other') - Number(b.group === 'other') ||
      (order.get(a.classroom.id) ?? 0) - (order.get(b.classroom.id) ?? 0) ||
      b.students.length - a.students.length ||
      a.classroom.name.localeCompare(b.classroom.name),
  )
}

// The youngest and oldest age among the given ages, as "9" or "9-11"; null when nobody has one.
export function ageRangeText(ages: number[]) {
  if (ages.length === 0) {
    return null
  }
  const low = Math.min(...ages)
  const high = Math.max(...ages)
  return low === high ? String(low) : `${low}-${high}`
}
