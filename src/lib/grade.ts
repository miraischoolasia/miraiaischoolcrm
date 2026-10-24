// A child's school grade, for a school that shows grade instead of age (setting age_display = 'grade').
// Stored as a number and the year it was true: 1-6 = Year 1-6, 7-11 = Form 1-5, 12 = left school. What it is today
// is worked out when it is read (the stored number plus the 1 Januarys since that year, at most 12), the same as
// public.grade_now in the database (20261102100000_grade_instead_of_age.sql), so it goes up by itself each year.

export const LEFT_SCHOOL = 12

export function gradeLabel(level: number): string {
  if (level >= LEFT_SCHOOL) {
    return 'Left school'
  }
  if (level >= 7) {
    return `Form ${level - 6}`
  }
  return `Year ${level}`
}

// The grades a person can pick (Year 1 to Form 5; "Left school" is only ever reached by time).
export const GRADE_OPTIONS = Array.from({ length: 11 }, (_, index) => ({ level: index + 1, label: gradeLabel(index + 1) }))

const yearOf = (day: string) => Number(day.slice(0, 4))

// The grade a stored grade has reached on a day (yyyy-mm-dd), or null when there is none.
export function gradeNow(level: number | null | undefined, year: number | null | undefined, onDay: string): number | null {
  if (level === null || level === undefined || year === null || year === undefined) {
    return null
  }
  return Math.min(level + Math.max(yearOf(onDay) - year, 0), LEFT_SCHOOL)
}

// "Year 4", from what is stored; null when no grade is stored.
export function gradeTextOn(level: number | null | undefined, year: number | null | undefined, onDay: string): string | null {
  const now = gradeNow(level, year, onDay)
  return now === null ? null : gradeLabel(now)
}

// The age a grade usually has, for the places that still need a number (Malaysia: Year 1 is 7, Form 1 is 13).
export function approximateAge(level: number): number {
  return level + 6
}

// Picked in a form: the number to store with the year it is true.
export function storedGrade(level: number | null, onDay: string): { gradeLevel: number; gradeYear: number } | null {
  return level === null ? null : { gradeLevel: level, gradeYear: yearOf(onDay) }
}
