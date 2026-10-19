import { describe, expect, it } from 'vitest'
import { busyLevel, groupBySlot, matchesFilter, monthWeeks, NO_FILTER, shiftMonth, shortGrade, subjectTone, type DayListLesson } from './calendarDayList'

const lesson = (id: number, change: Partial<DayListLesson> = {}): DayListLesson => ({
  key: `${id}:2026-10-19`,
  scheduleId: id,
  teacherId: 1,
  date: '2026-10-19',
  title: `Class ${id}`,
  subtitle: '',
  classroomId: id,
  kind: 'regular',
  startTime: '15:45:00',
  endTime: '17:00:00',
  makeupMinutes: 0,
  isMakeupOnly: false,
  studentCount: 10,
  log: null,
  editableUntil: null,
  state: 'open',
  minutes: 75,
  teacherName: 'Ms Tina',
  grade: 'Form 1',
  subject: 'MM',
  fbGroupUrl: null,
  zoomLink: null,
  ...change,
})

describe('calendar day list', () => {
  it('puts the classes that start together in one time, in the school\'s grade order, and counts the places', () => {
    const slots = groupBySlot(
      [
        lesson(1, { grade: 'Form 2', title: 'MM Form 2', studentCount: 178 }),
        lesson(2, { startTime: '17:15:00', endTime: '18:30:00' }),
        lesson(3, { grade: 'Year 5', title: 'BMK Year 5', studentCount: 34 }),
      ],
      ['Year 5', 'Form 1', 'Form 2'],
    )
    expect(slots.map((slot) => slot.startTime)).toEqual(['15:45:00', '17:15:00'])
    expect(slots[0].lessons.map((entry) => entry.title)).toEqual(['BMK Year 5', 'MM Form 2'])
    expect(slots[0].places).toBe(212)
    expect(slots[0].endTime).toBe('17:00:00')
  })

  it('filters by grade, subject and teacher together', () => {
    const maths = lesson(1)
    const science = lesson(2, { subject: 'SCI', teacherId: 2 })
    expect(matchesFilter(maths, NO_FILTER)).toBe(true)
    expect(matchesFilter(science, { ...NO_FILTER, subject: 'MM' })).toBe(false)
    expect(matchesFilter(science, { grade: 'Form 1', subject: 'SCI', teacherId: 2 })).toBe(true)
    expect(matchesFilter(science, { ...NO_FILTER, teacherId: 1 })).toBe(false)
  })

  it('lays a month out in whole weeks from Sunday', () => {
    const weeks = monthWeeks('2026-10')
    expect(weeks[0][0]).toBe('2026-09-27')
    expect(weeks.at(-1)?.at(-1)).toBe('2026-10-31')
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('shades a day by how busy it is next to the busiest day', () => {
    expect(busyLevel(0, 45)).toBe(0)
    expect(busyLevel(15, 45)).toBe(1)
    expect(busyLevel(32, 45)).toBe(2)
    expect(busyLevel(45, 45)).toBe(3)
  })

  it('gives a subject the same colour every time, and shortens Form / Year grades', () => {
    expect(subjectTone('SEJ')).toBe(subjectTone('SEJ'))
    expect(subjectTone(null).tag).toContain('slate')
    expect(shortGrade('Form 1')).toBe('F1')
    expect(shortGrade('Year 5')).toBe('Y5')
    expect(shortGrade('9-11 Years Old')).toBe('9-11 Years Old')
  })
})
