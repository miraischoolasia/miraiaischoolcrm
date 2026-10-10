import { describe, expect, it } from 'vitest'
import { getClassFilterValues, getLegendKeys, getScheduleKinds, legendKeys } from './calendarLegend'
import type { Classroom, Schedule } from '../types/domain'

const room = (id: number, category: Classroom['category']) => ({ id, category }) as Classroom
const classroomMap = new Map([[1, room(1, 'regular')], [2, room(2, 'trial')], [3, room(3, 'camp')]])
const schedule = (id: number, classroomId: number | null, eventType: Schedule['eventType'] = 'regular', status: Schedule['status'] = 'active') =>
  ({ id, classroomId, eventType, status }) as Schedule

describe('getScheduleKinds', () => {
  it('lists the kinds of class on the calendar, ignoring cancelled schedules', () => {
    const kinds = getScheduleKinds(
      [schedule(1, 1), schedule(2, 2), schedule(3, 3, 'regular', 'cancelled'), schedule(4, null, 'replacement')],
      classroomMap,
    )

    expect([...kinds].sort()).toEqual(['regular', 'replacement', 'trial'])
  })
})

describe('getLegendKeys', () => {
  const none = { kinds: new Set<'regular'>(['regular']), hasMakeups: false, hasCancelledDays: false }

  it('shows everything to someone who can edit the calendar', () => {
    expect(getLegendKeys({ canEdit: true, ...none })).toEqual(legendKeys)
  })

  it('shows a teacher only the colours they have', () => {
    expect(getLegendKeys({ canEdit: false, ...none })).toEqual(['regular', 'holiday'])
    expect(
      getLegendKeys({
        canEdit: false,
        kinds: new Set(['regular', 'trial', 'replacement'] as const),
        hasMakeups: true,
        hasCancelledDays: true,
      }),
    ).toEqual(['regular', 'trialBooked', 'replacement', 'holiday', 'cancelled', 'makeup'])
  })

  it('never shows Trial - Available to someone who cannot book', () => {
    expect(
      getLegendKeys({ canEdit: false, kinds: new Set(['trial'] as const), hasMakeups: false, hasCancelledDays: false }),
    ).not.toContain('trialAvailable')
  })
})

describe('getClassFilterValues', () => {
  const all = ['all', 'regular', 'trial', 'camp', 'replacement'] as const

  it('keeps every button for someone who can edit', () => {
    expect(getClassFilterValues({ canEdit: true, kinds: new Set(['regular'] as const), all: [...all] })).toEqual([...all])
  })

  it('hides the buttons when a teacher has one kind, and trims them to the kinds they have', () => {
    expect(getClassFilterValues({ canEdit: false, kinds: new Set(['regular'] as const), all: [...all] })).toEqual([])
    expect(
      getClassFilterValues({ canEdit: false, kinds: new Set(['regular', 'trial'] as const), all: [...all] }),
    ).toEqual(['all', 'regular', 'trial'])
  })
})
