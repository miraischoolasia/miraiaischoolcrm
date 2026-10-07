import type { Student } from '../types/domain'

// Mirrors is_in_classroom_on in the database: a stay runs from its first
// day (null = since the class began) up to, not including, the day it ended
// (null = still in the class).
export function isInClassroomOn(student: Student, classroomId: number, date: string) {
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
