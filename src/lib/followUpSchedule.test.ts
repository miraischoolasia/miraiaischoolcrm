import { describe, expect, it } from 'vitest'
import { DEFAULT_FOLLOW_UP_SCHEDULE, followUpScheduleError, readFollowUpSchedule } from './followUpSchedule'
import { percent } from './followUpCompletion'

describe('the follow-up schedule', () => {
  it('reads the school setting, with the defaults for what is missing or odd', () => {
    expect(readFollowUpSchedule(null)).toEqual(DEFAULT_FOLLOW_UP_SCHEDULE)
    expect(readFollowUpSchedule({ enabled: false, days: [1, 3], time: '09:30', round2_after_days: 7 })).toEqual({
      enabled: false,
      days: [1, 3],
      time: '09:30',
      round2AfterDays: 7,
    })
    expect(readFollowUpSchedule({ days: ['x'], time: 'soon' })).toEqual(DEFAULT_FOLLOW_UP_SCHEDULE)
  })

  it('says what is wrong before saving', () => {
    expect(followUpScheduleError(DEFAULT_FOLLOW_UP_SCHEDULE)).toBeNull()
    expect(followUpScheduleError({ ...DEFAULT_FOLLOW_UP_SCHEDULE, days: [] })).toBe('Keep 1 to 8 follow-ups.')
    expect(followUpScheduleError({ ...DEFAULT_FOLLOW_UP_SCHEDULE, days: [1, 1] })).toBe('Each follow-up has to be later than the one before.')
    expect(followUpScheduleError({ ...DEFAULT_FOLLOW_UP_SCHEDULE, days: [400] })).toBe('Each follow-up day is a whole number from 0 to 365.')
    expect(followUpScheduleError({ ...DEFAULT_FOLLOW_UP_SCHEDULE, round2AfterDays: 0 })).toBe('The quiet days before a new round are 1 to 365.')
  })

  it('counts a completion rate only when something was scheduled', () => {
    expect(percent(3, 4)).toBe(75)
    expect(percent(0, 0)).toBeNull()
  })
})
