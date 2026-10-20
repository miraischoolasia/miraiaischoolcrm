import { describe, expect, it } from 'vitest'
import { busiestWeekdayClasses, DAY_LIST_FROM_CLASSES, MONTH_WEEKLY_DEFAULT, readCalendarLayout, readMonthWeekly, usesDayList } from './calendarLayout'

const lesson = (dayOfWeek: number | null, change: Partial<{ status: 'active' | 'cancelled'; eventType: 'regular' | 'replacement' }> = {}) => ({
  dayOfWeek,
  status: 'active' as const,
  eventType: 'regular' as const,
  ...change,
})

describe('calendar layout', () => {
  it('reads a saved choice, and anything else as automatic', () => {
    expect(readCalendarLayout('classic')).toBe('classic')
    expect(readCalendarLayout('day_list')).toBe('day_list')
    expect(readCalendarLayout(null)).toBe('auto')
    expect(readCalendarLayout('grid')).toBe('auto')
  })

  it('counts the weekly classes on the busiest weekday, leaving out one-off and stopped ones', () => {
    const week = [lesson(1), lesson(1), lesson(2), lesson(1, { status: 'cancelled' }), lesson(1, { eventType: 'replacement' }), lesson(null)]
    expect(busiestWeekdayClasses(week)).toBe(2)
    expect(busiestWeekdayClasses([])).toBe(0)
  })

  it('on automatic, gives the day list to a school with many classes a day and keeps the calendar for one with few', () => {
    const few = Array.from({ length: 5 }, () => lesson(6))
    const many = Array.from({ length: DAY_LIST_FROM_CLASSES }, () => lesson(2))
    expect(usesDayList('auto', few)).toBe(false)
    expect(usesDayList('auto', many)).toBe(true)
  })

  it('follows the school\'s own choice whatever the number of classes', () => {
    const many = Array.from({ length: 45 }, () => lesson(2))
    expect(usesDayList('classic', many)).toBe(false)
    expect(usesDayList('day_list', [lesson(6)])).toBe(true)
  })
})

describe('weekly classes on the month calendar', () => {
  it('is the saved choice, or the school default when nothing is saved (on for Mirai)', () => {
    expect(readMonthWeekly(true, false)).toBe(true)
    expect(readMonthWeekly(false, true)).toBe(false)
    expect(readMonthWeekly(null, true)).toBe(true)
    expect(readMonthWeekly('yes', false)).toBe(false)
    // The tests run as the Mirai deployment (no brand name set).
    expect(MONTH_WEEKLY_DEFAULT).toBe(true)
  })
})
