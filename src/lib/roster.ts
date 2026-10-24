import type { Student } from '../types/domain'

// Mirrors is_in_classroom_on in the database: a stay runs from its first
// day (null = since the class began) up to, not including, the day it ended
// (null = still in the class).
export function isInClassroomOn(student: Student, classroomId: number, date: string) {
  // A one-day seat: sitting in this lesson, or taken out of it by Change class (migration 20261102200000).
  const seats = student.lessonSeats
  if (seats?.some((seat) => seat.toClassroomId === classroomId && seat.toDate === date)) {
    return true
  }
  if (seats?.some((seat) => seat.kind === 'change' && seat.fromClassroomId === classroomId && seat.fromDate === date)) {
    return false
  }
  const periods = student.classPeriods?.filter((period) => period.classroomId === classroomId)

  // No history loaded (before the history migration): fall back to the
  // class the student is in now.
  if (!periods || periods.length === 0) {
    return student.classPeriods === undefined && student.classroomId === classroomId
  }

  return periods.some(
    (period) =>
      (period.startDate === null || period.startDate <= date) &&
      (period.endDate === null || date < period.endDate),
  )
}

// The students in a class on one day, in the order of `students`.
export function getClassroomRosterOn(students: Student[], classroomId: number, date: string) {
  return students.filter((student) => isInClassroomOn(student, classroomId, date))
}

// The current stay: when the student joined the class they are in now.
export function getCurrentClassPeriod(student: Student) {
  if (!student.classroomId) {
    return null
  }
  return (
    student.classPeriods?.find(
      (period) => period.classroomId === student.classroomId && period.endDate === null,
    ) ?? null
  )
}

// Every class the student is in now (or is booked to join): the main class
// plus any extra class with an open stay.
export function getStudentClassIds(student: Student) {
  const ids = new Set<number>()
  if (student.classroomId) {
    ids.add(student.classroomId)
  }
  for (const period of student.classPeriods ?? []) {
    if (period.endDate === null) {
      ids.add(period.classroomId)
    }
  }
  return [...ids]
}

// The classes the student is in besides the main one.
export function getExtraClassIds(student: Student) {
  return getStudentClassIds(student).filter((id) => id !== student.classroomId)
}
