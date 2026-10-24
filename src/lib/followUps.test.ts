import { describe, expect, it } from 'vitest'
import type { CalendarItem } from './calendarItems'
import {
  describeFollowUp,
  dueFollowUps,
  followUpWorklist,
  nextFollowUpOf,
  followUpChoices,
  followUpDraft,
  followUpError,
  followUpState,
  openFollowUps,
  snoozeChoices,
  todaysFollowUps,
} from './followUps'

// Saturday 17 Oct 2026, 15:30 local.
const now = new Date(2026, 9, 17, 15, 30)

const item = (id: number, change: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  kind: 'task',
  title: 'Follow up Mei Ling',
  notes: null,
  date: '2026-10-18',
  startTime: '10:00',
  endTime: null,
  zoomLink: null,
  assigneeId: 1,
  leadId: 11,
  isDone: false,
  createdBy: 1,
  ...change,
})

describe('followUpChoices', () => {
  it('offers an hour from now, tonight, tomorrow, three days and next Monday', () => {
    const choices = followUpChoices(now)

    expect(choices.map((choice) => choice.key)).toEqual(['hour', 'tonight', 'tomorrow', 'three', 'monday'])
    expect(choices[0]).toMatchObject({ date: '2026-10-17', time: '16:30' })
    expect(choices[1]).toMatchObject({ date: '2026-10-17', time: '20:00' })
    expect(choices[2]).toMatchObject({ date: '2026-10-18', time: '10:00' })
    expect(choices[3]).toMatchObject({ date: '2026-10-20', time: '10:00' })
    expect(choices[4]).toMatchObject({ date: '2026-10-19', time: '10:00' })
  })

  it('leaves out tonight when it is nearly tonight already', () => {
    const late = new Date(2026, 9, 17, 19, 0)

    expect(followUpChoices(late).map((choice) => choice.key)).not.toContain('tonight')
  })

  it('takes Next Monday from a Monday to the Monday after', () => {
    const monday = new Date(2026, 9, 19, 9, 0)

    expect(followUpChoices(monday).find((choice) => choice.key === 'monday')?.date).toBe('2026-10-26')
  })

  it('carries an hour across midnight', () => {
    const night = new Date(2026, 9, 17, 23, 40)

    expect(followUpChoices(night)[0]).toMatchObject({ date: '2026-10-18', time: '00:40' })
  })
})

describe('openFollowUps', () => {
  it('lists the lead\'s tasks not done yet, the soonest first, and no one else\'s', () => {
    const items = [
      item(1, { date: '2026-10-20' }),
      item(2, { date: '2026-10-18', startTime: '09:00' }),
      item(3, { leadId: 99 }),
      item(4, { isDone: true }),
      item(5, { kind: 'event' }),
      item(6, { date: '2026-10-18', startTime: '08:00' }),
    ]

    expect(openFollowUps(items, 11).map((entry) => entry.id)).toEqual([6, 2, 1])
    expect(openFollowUps(items, null)).toEqual([])
  })
})

describe('followUpState and describeFollowUp', () => {
  it('is late when its time has passed, today later in the day, and later otherwise', () => {
    expect(followUpState(item(1, { date: '2026-10-17', startTime: '14:00' }), now)).toBe('late')
    expect(followUpState(item(1, { date: '2026-10-17', startTime: '18:00' }), now)).toBe('today')
    expect(followUpState(item(1, { date: '2026-10-18' }), now)).toBe('later')
    expect(followUpState(item(1, { date: '2026-10-16', startTime: null }), now)).toBe('late')
    expect(followUpState(item(1, { date: '2026-10-17', startTime: null }), now)).toBe('today')
  })

  it('says today and tomorrow in words, and the weekday and date after that', () => {
    expect(describeFollowUp({ date: '2026-10-17', startTime: '18:00' }, now)).toBe('Today 18:00')
    expect(describeFollowUp({ date: '2026-10-18', startTime: '10:00' }, now)).toBe('Tomorrow 10:00')
    expect(describeFollowUp({ date: '2026-10-21', startTime: '10:00' }, now)).toBe('Wed 21 Oct, 10:00')
    expect(describeFollowUp({ date: '2026-10-21', startTime: null }, now)).toBe('Wed 21 Oct')
  })
})

describe('followUpError and followUpDraft', () => {
  it('refuses a missing day or time, and a time that has passed', () => {
    expect(followUpError('', '10:00', now)).toBe('Pick the day.')
    expect(followUpError('2026-10-18', '', now)).toBe('Pick the time.')
    expect(followUpError('2026-10-17', '15:00', now)).toBe('That time has already passed.')
    expect(followUpError('2026-10-17', '15:31', now)).toBeNull()
    expect(followUpError('2026-10-18', '09:00', now)).toBeNull()
  })

  it('makes a task of the lead, with the time and the person to remind', () => {
    const draft = followUpDraft({ leadName: 'Mei Ling', date: '2026-10-18', time: '10:00', note: ' ask about F4 ', assigneeId: 3, leadId: 11 })

    expect(draft).toMatchObject({
      kind: 'task',
      title: 'Follow up Mei Ling',
      notes: 'ask about F4',
      date: '2026-10-18',
      startTime: '10:00',
      endTime: '',
      assigneeId: 3,
      isDone: false,
      leadId: 11,
    })
  })
})

describe('dueFollowUps and snoozeChoices', () => {
  it('rings only for the person it is for, once its time has come, and not while put off', () => {
    const items = [
      item(1, { date: '2026-10-17', startTime: '15:00' }),
      item(2, { date: '2026-10-17', startTime: '16:00' }),
      item(3, { date: '2026-10-17', startTime: '14:00', assigneeId: 2 }),
      item(4, { date: '2026-10-16', startTime: '09:00', isDone: true }),
      item(5, { date: '2026-10-16', startTime: '09:00', leadId: null }),
      item(6, { date: '2026-10-16', startTime: '09:00' }),
      item(7, { date: '2026-10-17', startTime: '10:00' }),
    ]

    expect(dueFollowUps(items, 1, now).map((entry) => entry.id)).toEqual([6, 7, 1])
    expect(dueFollowUps(items, 1, now, { 7: now.getTime() + 1000 }).map((entry) => entry.id)).toEqual([6, 1])
    expect(dueFollowUps(items, 1, now, { 7: now.getTime() }).map((entry) => entry.id)).toEqual([6, 7, 1])
    expect(dueFollowUps(items, null, now)).toEqual([])
  })

  it('offers ten minutes, an hour and tomorrow at 10:00', () => {
    const [ten, hour, tomorrow] = snoozeChoices(now)

    expect(ten.until).toBe(now.getTime() + 10 * 60 * 1000)
    expect(hour.until).toBe(now.getTime() + 60 * 60 * 1000)
    expect(new Date(tomorrow.until)).toEqual(new Date(2026, 9, 18, 10, 0))
  })
})

describe('todaysFollowUps', () => {
  it('lists what the person has due today or late, oldest first, marking the late ones', () => {
    const items = [
      item(1, { date: '2026-10-17', startTime: '18:00' }),
      item(2, { date: '2026-10-16', startTime: '09:00' }),
      item(3, { date: '2026-10-17', startTime: '14:00' }),
      item(4, { date: '2026-10-18' }),
      item(5, { date: '2026-10-17', startTime: '14:00', assigneeId: 2 }),
      item(6, { date: '2026-10-17', isDone: true }),
    ]

    expect(todaysFollowUps(items, 1, now)).toEqual([
      { id: 2, leadId: 11, title: 'Follow up Mei Ling', notes: null, when: 'Fri 16 Oct, 09:00', late: true },
      { id: 3, leadId: 11, title: 'Follow up Mei Ling', notes: null, when: 'Today 14:00', late: true },
      { id: 1, leadId: 11, title: 'Follow up Mei Ling', notes: null, when: 'Today 18:00', late: false },
    ])
    expect(todaysFollowUps(items, null, now)).toEqual([])
  })
})

describe('the follow-up work list', () => {
  const auto = (id: number, date: string, step: number, change: Partial<CalendarItem> = {}) =>
    item(id, { date, startTime: '10:00', followupRound: 1, followupStep: step, ...change })
  const items = [
    auto(1, '2026-10-15', 1),
    auto(2, '2026-10-17', 2),
    auto(3, '2026-10-20', 3),
    auto(4, '2026-10-30', 4),
    auto(5, '2026-10-16', 5, { isDone: true }),
    item(6, { date: '2026-10-17', assigneeId: 2, leadId: 12 }),
  ]

  it('splits what is open into overdue, today and the next 7 days, with the step of its round', () => {
    const list = followUpWorklist(items, { meId: 1, seesAll: false, now })
    expect(list.late.map((row) => row.item.id)).toEqual([1])
    expect(list.today.map((row) => [row.item.id, row.stepLabel])).toEqual([[2, '2/5']])
    expect(list.soon.map((row) => row.item.id)).toEqual([3])
  })

  it('shows someone only their own, an admin everybody', () => {
    expect(followUpWorklist(items, { meId: 1, seesAll: false, now }).today.map((row) => row.item.id)).toEqual([2])
    expect(followUpWorklist(items, { meId: 1, seesAll: true, now }).today.map((row) => row.item.id)).toEqual([2, 6])
  })

  it('gives a chat its lead next follow-up and whether it is late', () => {
    expect(nextFollowUpOf(items, 11, now)).toMatchObject({ state: 'late', stepLabel: '1/5' })
    expect(nextFollowUpOf(items, 12, now)).toMatchObject({ state: 'today', stepLabel: null })
    expect(nextFollowUpOf(items, 99, now)).toBeNull()
  })
})
