import { describe, expect, it } from 'vitest'
import { formatStudentAge, getAgeOn, getStudentAge, trialChildAgeText } from './age'

describe('getAgeOn', () => {
  it('counts whole years and moves on at the birthday', () => {
    expect(getAgeOn('2016-10-14', '2026-10-13')).toBe(9)
    expect(getAgeOn('2016-10-14', '2026-10-14')).toBe(10)
    expect(getAgeOn('2016-12-31', '2027-01-01')).toBe(10)
  })

  it('is null for a date in the future or a value that is not a date', () => {
    expect(getAgeOn('2030-01-01', '2026-10-13')).toBeNull()
    expect(getAgeOn('', '2026-10-13')).toBeNull()
    expect(getAgeOn('13/10/2016', '2026-10-13')).toBeNull()
  })
})

describe('getStudentAge', () => {
  it('prefers the birth date and falls back to the age written at booking', () => {
    expect(getStudentAge({ dateOfBirth: '2016-03-01', age: 7 }, '2026-10-13')).toEqual({ years: 10, source: 'birth' })
    expect(getStudentAge({ dateOfBirth: null, age: 7 }, '2026-10-13')).toEqual({ years: 7, source: 'booking' })
    expect(getStudentAge({ age: null }, '2026-10-13')).toBeNull()
  })

  it('says which kind of age it is', () => {
    expect(formatStudentAge({ years: 10, source: 'birth' })).toBe('10 yrs')
    expect(formatStudentAge({ years: 1, source: 'birth' })).toBe('1 yr')
    expect(formatStudentAge({ years: 7, source: 'booking' })).toBe('7 yrs (at booking)')
    expect(formatStudentAge(null)).toBeNull()
  })
})

describe('trialChildAgeText', () => {
  it('shows the age in age mode and the grade in grade mode', () => {
    const booking = { childAge: 7, gradeLevel: 2, gradeYear: 2026 }
    expect(trialChildAgeText(booking, '2026-10-23', 'age')).toBe('7 yrs')
    expect(trialChildAgeText(booking, '2026-10-23', 'grade')).toBe('Year 2')
    expect(trialChildAgeText(booking, '2027-02-01', 'grade')).toBe('Year 3')
  })

  it('falls back to the age when no grade is stored, and is null with neither', () => {
    expect(trialChildAgeText({ childAge: 7 }, '2026-10-23', 'grade')).toBe('7 yrs')
    expect(trialChildAgeText({ childAge: 1 }, '2026-10-23', 'age')).toBe('1 yr')
    expect(trialChildAgeText({ childAge: null }, '2026-10-23', 'grade')).toBeNull()
  })
})
