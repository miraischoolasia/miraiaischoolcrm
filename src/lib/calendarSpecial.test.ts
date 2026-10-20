import { describe, expect, it } from 'vitest'
import { buildScheduleEvents } from './schedule'
import {
  bookedTrialEvents,
  classLine,
  linkReplacements,
  madeUpText,
  monthSpecialEvents,
  timeRange,
  type SpecialCard,
} from './calendarSpecial'
import type { Classroom, MakeupPlan, Schedule, ScheduleException, Teacher } from '../types/domain'

const classroom = (id: number, name: string, extra: Partial<Classroom> = {}): Classroom => ({
  id,
  name,
  category: 'regular',
  ageGroup: 'Form 2',
  programLevel: 'Foundation',
  teacherId: 1,
  status: 'active',
  notes: null,
  archivedAt: null,
  ...extra,
})

const weekly = (id: number, classroomId: number | null, extra: Partial<Schedule> = {}): Schedule => ({
  id,
  teacherId: 1,
  classroomId,
  title: `Class ${id}`,
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 1,
  scheduledDate: null,
  startTime: '19:00',
  endTime: '20:15',
  startRecur: '2026-09-01',
  endRecur: null,
  status: 'active',
  notes: null,
  ...extra,
})

const oneOff = (id: number, date: string, extra: Partial<Schedule> = {}): Schedule => ({
  ...weekly(id, null),
  title: `One-off ${id}`,
  eventType: 'replacement',
  recurrenceType: 'none',
  dayOfWeek: null,
  scheduledDate: date,
  startRecur: null,
  ...extra,
})

const cancelled = (scheduleId: number, date: string, extra: Partial<ScheduleException> = {}): ScheduleException => ({
  id: scheduleId * 100,
  scheduleId,
  exceptionDate: date,
  reason: null,
  ...extra,
})

describe('timeRange', () => {
  it('writes the time like the timetable does', () => {
    expect(timeRange('19:00', '20:15')).toBe('7.00–8.15PM')
    expect(timeRange('19:00:00', '20:15:00')).toBe('7.00–8.15PM')
    expect(timeRange('11:30', '12:30')).toBe('11.30AM–12.30PM')
    expect(timeRange('09:05', '10:00')).toBe('9.05–10.00AM')
  })
})

describe('classLine', () => {
  it('is the grade and subject when the class has a subject, otherwise its name', () => {
    expect(classLine(classroom(1, 'F2 Bahasa', { subjectId: 3 }), 'BIK', 'x')).toBe('F2 BIK')
    expect(classLine(classroom(1, 'Coding Explorers', { ageGroup: '6-8 Years Old' }), null, 'x')).toBe('Coding Explorers')
    expect(classLine(null, null, 'Extra Maths')).toBe('Extra Maths')
  })
})

describe('linkReplacements', () => {
  const classes = new Map([[1, classroom(1, 'F2 BIK')]])

  it('links a day dragged to a new date, a replacement saved on the day, and an older one by its note', () => {
    const schedules = [
      weekly(10, 1),
      oneOff(20, '2026-10-14'),
      oneOff(21, '2026-10-21'),
      oneOff(22, '2026-10-28', { notes: 'Makeup for F2 BIK (cancelled 2026-10-26).' }),
      oneOff(23, '2026-10-29'),
    ]
    const links = linkReplacements(
      [
        cancelled(10, '2026-10-12', { movedToScheduleId: 20 }),
        cancelled(10, '2026-10-19', { replacementScheduleId: 21 }),
        cancelled(10, '2026-10-26'),
        cancelled(10, '2026-11-02'),
      ],
      schedules,
      classes,
    )

    expect(links.byCancelledDay.get('10:2026-10-12')?.id).toBe(20)
    expect(links.byCancelledDay.get('10:2026-10-19')?.id).toBe(21)
    expect(links.byCancelledDay.get('10:2026-10-26')?.id).toBe(22)
    expect(links.byCancelledDay.has('10:2026-11-02')).toBe(false)
    // A one-off class made for no cancelled day is an extra class.
    expect(links.byReplacement.has(23)).toBe(false)
  })

  it('ignores a cancelled replacement', () => {
    const links = linkReplacements(
      [cancelled(10, '2026-10-19', { replacementScheduleId: 21 })],
      [weekly(10, 1), oneOff(21, '2026-10-21', { status: 'cancelled' })],
      classes,
    )
    expect(links.byCancelledDay.size).toBe(0)
  })
})

describe('madeUpText', () => {
  it('says when the day is made up, or nothing when it is not arranged', () => {
    expect(madeUpText(oneOff(20, '2026-10-14'), null)).toMatch(/^Replacement: Wed 14 Oct, 7\.00–8\.15PM$/)
    const plan: MakeupPlan = {
      id: 1,
      classroomId: 1,
      missedDate: '2026-10-12',
      studentId: null,
      missedMinutes: 60,
      notes: null,
      sessions: [{ sessionDate: '2026-10-19', extraMinutes: 30 }],
    }
    expect(madeUpText(null, plan)).toBe('Made up with extra minutes: Mon 19 Oct +30 min')
    expect(madeUpText(null, null)).toBeNull()
  })
})

describe('monthSpecialEvents', () => {
  const classes = new Map([[1, classroom(1, 'F2 Bahasa Inggeris', { subjectId: 7 })]])
  const teachers = new Map([[1, { id: 1, fullName: 'Ms Rachel' } as Teacher]])
  const schedules = [weekly(10, 1), oneOff(20, '2026-10-14'), oneOff(23, '2026-10-29', { title: 'Extra Maths' })]
  const exceptions = [cancelled(10, '2026-10-12', { replacementScheduleId: 20 }), cancelled(10, '2026-10-19')]
  const events = buildScheduleEvents(schedules, classes, new Map(), teachers, new Map(), new Map(), exceptions)
  const month = monthSpecialEvents(events, {
    schedules,
    classroomMap: classes,
    subjectName: (id) => (id === 7 ? 'BIK' : null),
    links: linkReplacements(exceptions, schedules, classes),
    makeupPlans: [],
  })
  const cards = month.map((event) => ({ id: event.id, ...(event.extendedProps?.special as SpecialCard) }))

  it('keeps only the cancelled days, replacements and extra classes, not the weekly class', () => {
    expect(cards.map((card) => card.id).sort()).toEqual([
      'schedule-10-cancelled-2026-10-12',
      'schedule-10-cancelled-2026-10-19',
      'schedule-20',
      'schedule-23',
    ])
  })

  it('writes each card as time, grade and subject, and teacher', () => {
    expect(cards.find((card) => card.id === 'schedule-10-cancelled-2026-10-12')).toMatchObject({
      kind: 'cancel',
      time: '7.00–8.15PM',
      line: 'F2 BIK',
      teacher: 'Ms Rachel',
      madeUp: 'Replacement: Wed 14 Oct, 7.00–8.15PM',
    })
    expect(cards.find((card) => card.id === 'schedule-10-cancelled-2026-10-19')).toMatchObject({ kind: 'cancel', madeUp: null })
    // The replacement made from the cancelled day has no class of its own: it is named after that day's class.
    expect(cards.find((card) => card.id === 'schedule-20')).toMatchObject({ kind: 'replacement', line: 'F2 BIK' })
    expect(cards.find((card) => card.id === 'schedule-23')).toMatchObject({ kind: 'extra', line: 'Extra Maths' })
  })

  it('adds each weekly class as a faded card when the school shows them, after the special days', () => {
    const withWeekly = monthSpecialEvents(events, {
      schedules,
      classroomMap: classes,
      subjectName: (id) => (id === 7 ? 'BIK' : null),
      links: linkReplacements(exceptions, schedules, classes),
      makeupPlans: [],
      weekly: true,
    })
    const weekly = withWeekly.find((event) => event.id === 'schedule-10')
    expect(weekly?.extendedProps?.special).toMatchObject({ kind: 'weekly', time: '7.00–8.15PM', line: 'F2 BIK', teacher: 'Ms Rachel' })
    expect(weekly?.extendedProps?.monthRank).toBe(1)
    expect(withWeekly.find((event) => event.id === 'schedule-23')?.extendedProps?.monthRank).toBe(0)
    expect(withWeekly).toHaveLength(month.length + 1)
  })
})

describe('bookedTrialEvents', () => {
  it('shows a trial slot only on the days a child is booked, and not on a cancelled day', () => {
    const trialClass = classroom(5, 'Trial Coding', { category: 'trial' })
    const slot = weekly(50, 5, { startTime: '10:00', endTime: '11:00' })
    const booking = (id: number, date: string) => ({
      id,
      scheduleId: 50,
      bookingDate: date,
      leadId: null,
      studentId: null,
      childName: `Child ${id}`,
      childAge: 7,
      phone: null,
      notes: null,
    })
    const events = bookedTrialEvents(
      [booking(1, '2026-10-12'), booking(2, '2026-10-12'), booking(3, '2026-10-19'), { ...booking(4, '2026-10-12'), scheduleId: 99 }],
      [slot],
      [cancelled(50, '2026-10-19')],
      new Map([[5, trialClass]]),
      () => 'Ms Lee',
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'trial-booked-50-2026-10-12', start: '2026-10-12T10:00' })
    expect(events[0].extendedProps?.special).toMatchObject({ kind: 'trial', line: 'Trial Coding · 2 booked', teacher: 'Ms Lee' })
  })
})
