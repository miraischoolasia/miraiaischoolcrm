import type { FeeLevel } from './feeCalculator/quote'
import { gradeNow } from './grade'
import type { Lead, Student } from '../types/domain'

// The level the Fee Calculator starts on for this family: the first child's grade (Year 1-6 primary, Form 1-5
// secondary), from the lead or the student; null when no grade is known (the calculator's own start then).
export function feeLevelOf(lead: Lead | null, students: Student[], today: string): FeeLevel | null {
  const grades = [
    ...(lead?.children ?? []).map((child) => gradeNow(child.gradeLevel, child.gradeYear, today)),
    ...students.map((student) => gradeNow(student.gradeLevel, student.gradeYear, today)),
  ].filter((grade): grade is number => grade !== null && grade >= 1 && grade <= 11)
  if (grades.length === 0) {
    return null
  }
  return grades[0] >= 7 ? 'secondary' : 'primary'
}
