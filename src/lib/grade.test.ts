import { describe, expect, it } from 'vitest'
import { childAgeText, studentAgeText } from './age'
import { GRADE_OPTIONS, approximateAge, gradeLabel, gradeNow, gradeTextOn, storedGrade } from './grade'

describe('grade', () => {
  it('names Year 1 to 6, Form 1 to 5 and left school', () => {
    expect(gradeLabel(1)).toBe('Year 1')
    expect(gradeLabel(6)).toBe('Year 6')
    expect(gradeLabel(7)).toBe('Form 1')
    expect(gradeLabel(11)).toBe('Form 5')
    expect(gradeLabel(12)).toBe('Left school')
    expect(GRADE_OPTIONS).toHaveLength(11)
  })

  it('goes up by one each 1 January and stops at left school', () => {
    expect(gradeNow(4, 2026, '2026-10-23')).toBe(4)
    expect(gradeNow(4, 2026, '2026-12-31')).toBe(4)
    expect(gradeNow(4, 2026, '2027-01-01')).toBe(5)
    expect(gradeNow(6, 2026, '2027-01-01')).toBe(7)
    expect(gradeNow(11, 2026, '2027-06-01')).toBe(12)
    expect(gradeNow(11, 2026, '2031-06-01')).toBe(12)
    expect(gradeNow(4, 2026, '2025-06-01')).toBe(4)
    expect(gradeNow(null, null, '2026-10-23')).toBeNull()
  })

  it('writes the grade the way a person reads it', () => {
    expect(gradeTextOn(6, 2026, '2027-03-01')).toBe('Form 1')
    expect(gradeTextOn(null, 2026, '2027-03-01')).toBeNull()
  })

  it('gives the usual age of a grade, and stores a pick with its year', () => {
    expect(approximateAge(1)).toBe(7)
    expect(approximateAge(7)).toBe(13)
    expect(storedGrade(5, '2026-10-23')).toEqual({ gradeLevel: 5, gradeYear: 2026 })
    expect(storedGrade(null, '2026-10-23')).toBeNull()
  })
})

describe('age or grade for a student and a lead child', () => {
  const kid = { dateOfBirth: null, age: 9, gradeLevel: 4, gradeYear: 2026 }

  it('shows the age for a school that shows age', () => {
    expect(studentAgeText(kid, '2026-10-23', 'age')).toBe('9 yrs (at booking)')
    expect(childAgeText({ age: 9, gradeLevel: 4, gradeYear: 2026 }, '2026-10-23', 'age')).toBe('9')
  })

  it('shows the grade (moved on by the year) for a school that shows grade, and nothing when there is none', () => {
    expect(studentAgeText(kid, '2027-02-01', 'grade')).toBe('Year 5')
    expect(studentAgeText({ ...kid, gradeLevel: null, gradeYear: null }, '2026-10-23', 'grade')).toBeNull()
    expect(childAgeText({ age: 9, gradeLevel: 6, gradeYear: 2026 }, '2027-02-01', 'grade')).toBe('Form 1')
    // A child with no grade yet keeps its age (never turned into a grade).
    expect(childAgeText({ age: 9 }, '2026-10-23', 'grade')).toBe('9')
  })
})
