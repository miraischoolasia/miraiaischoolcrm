import type { Student } from '../types/domain'
import type { AgeDisplayMode } from './ageDisplay'
import { gradeTextOn } from './grade'

// Whole years between a birth date and a day, both yyyy-mm-dd. Null when the date is not a date, or is
// after the day.
export function getAgeOn(dateOfBirth: string, onDate: string): number | null {
  const born = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onDate)
  if (!born || !day) {
    return null
  }
  const [bornYear, bornMonth, bornDay] = born.slice(1).map(Number)
  const [year, month, dayOfMonth] = day.slice(1).map(Number)
  let years = year - bornYear
  if (month < bornMonth || (month === bornMonth && dayOfMonth < bornDay)) {
    years -= 1
  }
  return years >= 0 ? years : null
}

export type StudentAge = {
  years: number
  // 'birth': worked out from the birth date, so it moves on by itself. 'booking': the age written
  // when the child was booked, which does not move.
  source: 'birth' | 'booking'
}

export function getStudentAge(
  student: Pick<Student, 'dateOfBirth' | 'age'>,
  todayString: string,
): StudentAge | null {
  if (student.dateOfBirth) {
    const years = getAgeOn(student.dateOfBirth, todayString)
    if (years !== null) {
      return { years, source: 'birth' }
    }
  }
  if (student.age !== null && student.age !== undefined) {
    return { years: student.age, source: 'booking' }
  }
  return null
}

// What a list shows beside a student: the age, or for a school that shows grade the grade (nothing when no grade is
// stored yet; an age is never turned into a grade).
export function studentAgeText(
  student: Pick<Student, 'dateOfBirth' | 'age' | 'gradeLevel' | 'gradeYear'>,
  todayString: string,
  mode: AgeDisplayMode,
): string | null {
  if (mode === 'grade') {
    return gradeTextOn(student.gradeLevel, student.gradeYear, todayString)
  }
  return formatStudentAge(getStudentAge(student, todayString))
}

// A lead's child as a number or a grade: "9", or for a school that shows grade "Year 4" (the stored age is the
// fallback for a child with no grade yet, so nobody is left blank).
export function childAgeText(
  child: { age: number; gradeLevel?: number | null; gradeYear?: number | null },
  todayString: string,
  mode: AgeDisplayMode,
): string {
  if (mode === 'grade') {
    const grade = gradeTextOn(child.gradeLevel, child.gradeYear, todayString)
    if (grade) {
      return grade
    }
  }
  return String(child.age)
}

// A booked trial child: "7 yrs", or for a school that shows grade "Year 2" (a booking made before the grade was kept
// still shows its age). Null when there is nothing to show.
export function trialChildAgeText(
  booking: { childAge: number | null; gradeLevel?: number | null; gradeYear?: number | null },
  todayString: string,
  mode: AgeDisplayMode,
): string | null {
  if (mode === 'grade') {
    const grade = gradeTextOn(booking.gradeLevel, booking.gradeYear, todayString)
    if (grade) {
      return grade
    }
  }
  return booking.childAge === null ? null : `${booking.childAge} ${booking.childAge === 1 ? 'yr' : 'yrs'}`
}

// "10 yrs", or "10 yrs (at booking)" for the age that does not move.
export function formatStudentAge(age: StudentAge | null) {
  if (!age) {
    return null
  }
  const text = `${age.years} ${age.years === 1 ? 'yr' : 'yrs'}`
  return age.source === 'booking' ? `${text} (at booking)` : text
}
