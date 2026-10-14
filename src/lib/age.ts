import type { Student } from '../types/domain'

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

// "10 yrs", or "10 yrs (at booking)" for the age that does not move.
export function formatStudentAge(age: StudentAge | null) {
  if (!age) {
    return null
  }
  const text = `${age.years} ${age.years === 1 ? 'yr' : 'yrs'}`
  return age.source === 'booking' ? `${text} (at booking)` : text
}
