import type { Classroom, Schedule, ScheduleException, Student } from '../types/domain'
import { slotRunsOn } from './trialOrphans'
import { getClassroomRosterOn, getStudentClassIds, isInClassroomOn } from './roster'

// The lessons Change class and Replacement choose between (migration 20261102200000_lesson_seats.sql). A lesson is
// one class on one day. The database decides in the end (classroom_lesson_on); this only offers the days that fit.

export type Lesson = {
  scheduleId: number
  classroomId: number
  className: string
  ageGroup: string
  date: string
  startTime: string
  endTime: string
  teacherId: number
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const moved = new Date(year, month - 1, day + days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${moved.getFullYear()}-${pad(moved.getMonth() + 1)}-${pad(moved.getDate())}`
}

// The classes that meet on a day: a weekly class on its day (the 29th-31st have no regular class), a one-off
// replacement on its date, never a cancelled day.
export function lessonsOnDate(
  date: string,
  schedules: Schedule[],
  exceptions: ScheduleException[],
  classrooms: Classroom[],
): Lesson[] {
  const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]))
  const dayOfMonth = Number(date.slice(8, 10))
  const lessons: Lesson[] = []
  for (const schedule of schedules) {
    const classroom = schedule.classroomId === null ? undefined : classroomById.get(schedule.classroomId)
    if (!classroom || classroom.status === 'archived' || schedule.status !== 'active') {
      continue
    }
    if (exceptions.some((exception) => exception.scheduleId === schedule.id && exception.exceptionDate === date)) {
      continue
    }
    const meets =
      schedule.eventType === 'replacement'
        ? schedule.scheduledDate === date
        : slotRunsOn(schedule, date) && (dayOfMonth < 29 || classroom.category === 'trial')
    if (meets) {
      lessons.push({
        scheduleId: schedule.id,
        classroomId: classroom.id,
        className: classroom.name,
        ageGroup: classroom.ageGroup,
        date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        teacherId: schedule.teacherId,
      })
    }
  }
  return lessons.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className))
}

// The lessons of the classes a student is in, from `from` for `days` days (a lesson they are not in that day, for
// instance after a Change class, is left out).
export function studentLessons(
  student: Student,
  from: string,
  days: number,
  schedules: Schedule[],
  exceptions: ScheduleException[],
  classrooms: Classroom[],
): Lesson[] {
  const classIds = new Set(getStudentClassIds(student))
  const found: Lesson[] = []
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset)
    for (const lesson of lessonsOnDate(date, schedules, exceptions, classrooms)) {
      if (classIds.has(lesson.classroomId) && isInClassroomOn(student, lesson.classroomId, date)) {
        found.push(lesson)
      }
    }
  }
  return found
}

export type TargetLesson = Lesson & { children: number; sameAgeGroup: boolean }

// The lessons a student could sit in, from `from` for `days` days: every other lesson they are not already in, the
// class's age group first, then by day and time. "children" is how many are in it now.
export function seatTargets(
  student: Student,
  students: Student[],
  from: string,
  days: number,
  schedules: Schedule[],
  exceptions: ScheduleException[],
  classrooms: Classroom[],
): TargetLesson[] {
  const own = new Set(getStudentClassIds(student))
  const ownGroups = new Set(classrooms.filter((classroom) => own.has(classroom.id)).map((classroom) => classroom.ageGroup))
  const found: TargetLesson[] = []
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(from, offset)
    for (const lesson of lessonsOnDate(date, schedules, exceptions, classrooms)) {
      if (isInClassroomOn(student, lesson.classroomId, date)) {
        continue
      }
      found.push({
        ...lesson,
        children: getClassroomRosterOn(students, lesson.classroomId, date).length,
        sameAgeGroup: ownGroups.has(lesson.ageGroup),
      })
    }
  }
  return found.sort(
    (a, b) =>
      Number(b.sameAgeGroup) - Number(a.sameAgeGroup) ||
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.className.localeCompare(b.className),
  )
}

// What a lesson's calendar card says about one-day seats: who is in it as a replacement or from another class's change,
// and who left it by a change ("Replacement: Mia"). A school with many classes gets counts instead of names.
export function lessonSeatNotes(
  students: Student[],
  classroomId: number | null,
  date: string,
  summary: boolean,
): string[] {
  if (classroomId === null) {
    return []
  }
  const replacements: string[] = []
  const changedIn: string[] = []
  const changedOut: string[] = []
  for (const student of students) {
    for (const seat of student.lessonSeats ?? []) {
      if (seat.toClassroomId === classroomId && seat.toDate === date) {
        ;(seat.kind === 'replacement' ? replacements : changedIn).push(student.name)
      }
      if (seat.kind === 'change' && seat.fromClassroomId === classroomId && seat.fromDate === date) {
        changedOut.push(student.name)
      }
    }
  }
  const line = (label: string, names: string[]) =>
    names.length === 0 ? null : summary ? `${names.length} ${label.toLowerCase()}` : `${label}: ${names.join(', ')}`
  return [line('Replacement', replacements), line('Changed class in', changedIn), line('Changed class out', changedOut)].filter(
    (entry): entry is string => entry !== null,
  )
}
