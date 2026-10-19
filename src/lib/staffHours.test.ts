import { describe, expect, it } from 'vitest'
import {
  describeWeek,
  parseBusinessHours,
  parseLeaveReasons,
  rosterDraftError,
  weekError,
  weekOn,
  zonedIso,
  type Shift,
} from './staffHours'

const shift = (weekday: number, start: string, end: string, effectiveFrom = '2000-01-01', effectiveTo: string | null = null): Shift => ({
  id: weekday,
  teacherId: 9,
  weekday,
  start,
  end,
  effectiveFrom,
  effectiveTo,
})

describe('working hours', () => {
  it('finds the week a person has on a day, Monday first', () => {
    const shifts = [
      shift(0, '10:00', '12:00'),
      shift(1, '09:00', '18:00'),
      shift(3, '14:00', '22:00', '2026-11-01'),
      shift(2, '09:00', '13:00', '2000-01-01', '2026-10-31'),
    ]
    expect(describeWeek(weekOn(shifts, 9, '2026-10-20'))).toBe('Mon 09:00–18:00 · Tue 09:00–13:00 · Sun 10:00–12:00')
    expect(describeWeek(weekOn(shifts, 9, '2026-11-02'))).toBe('Mon 09:00–18:00 · Wed 14:00–22:00 · Sun 10:00–12:00')
    expect(describeWeek(weekOn(shifts, 1, '2026-10-20'))).toBe('No set hours')
  })

  it('checks a week before it is saved', () => {
    expect(weekError([{ weekday: 1, start: '09:00', end: '18:00' }])).toBeNull()
    expect(weekError([{ weekday: 1, start: '18:00', end: '09:00' }])).toMatch(/night shift/)
    expect(weekError([{ weekday: 1, start: '09:00', end: '13:00' }, { weekday: 1, start: '12:00', end: '18:00' }])).toMatch(/overlap/)
    expect(weekError([{ weekday: 1, start: '9am', end: '18:00' }])).toMatch(/like 09:00/)
    expect(weekError([{ weekday: 2, start: '20:00', end: '24:00' }])).toBeNull()
  })

  it('turns a school date and time into a moment with its offset', () => {
    expect(zonedIso('2026-10-20', '09:00')).toBe('2026-10-20T09:00:00+08:00')
    expect(zonedIso('2026-10-20', '24:00')).toBe('2026-10-21T00:00:00+08:00')
    expect(zonedIso('2026-07-01', '09:00', 'Europe/London')).toBe('2026-07-01T09:00:00+01:00')
  })

  it('checks time off before it is saved', () => {
    const draft = {
      kind: 'off' as const,
      teacherId: 9,
      otherTeacherId: null,
      fromDay: '2026-10-21',
      fromTime: '00:00',
      toDay: '2026-10-22',
      toTime: '00:00',
      reason: 'Sick leave',
      note: '',
    }
    expect(rosterDraftError(draft)).toBeNull()
    expect(rosterDraftError({ ...draft, toDay: '2026-10-21' })).toMatch(/after the start/)
    expect(rosterDraftError({ ...draft, kind: 'swap' })).toMatch(/instead/)
    expect(rosterDraftError({ ...draft, kind: 'swap', otherTeacherId: 9 })).toMatch(/instead/)
    expect(rosterDraftError({ ...draft, kind: 'swap', otherTeacherId: 3 })).toBeNull()
    expect(rosterDraftError({ ...draft, teacherId: null })).toMatch(/person/)
  })

  it('reads the school settings, falling back to the defaults', () => {
    expect(
      parseBusinessHours({ days: { '1': [{ start: '09:00', end: '18:00' }], '8': [], '2': 'x' }, time_zone: 'Asia/Singapore' }),
    ).toEqual({ days: { '1': [{ start: '09:00', end: '18:00' }] }, timeZone: 'Asia/Singapore' })
    expect(parseBusinessHours(null)).toEqual({ days: {}, timeZone: 'Asia/Kuala_Lumpur' })
    expect(parseLeaveReasons(['Annual leave', ' ', 3])).toEqual(['Annual leave'])
    expect(parseLeaveReasons(undefined)).toEqual(['Annual leave', 'Sick leave', 'Off day', 'Swap'])
  })
})
