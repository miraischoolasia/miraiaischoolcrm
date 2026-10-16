import { describe, expect, it } from 'vitest'
import {
  buildCalendarItemEvents,
  emptyItemDraft,
  itemDraftError,
  itemsVisibleTo,
  type CalendarItem,
} from './calendarItems'

const item = (over: Partial<CalendarItem>): CalendarItem => ({
  id: 1,
  kind: 'task',
  title: 'Call Mrs Tan',
  notes: null,
  date: '2026-10-20',
  startTime: null,
  endTime: null,
  zoomLink: null,
  assigneeId: null,
  leadId: null,
  isDone: false,
  createdBy: null,
  ...over,
})

describe('itemDraftError', () => {
  const draft = (over: Partial<ReturnType<typeof emptyItemDraft>>) => ({ ...emptyItemDraft('2026-10-20'), title: 'Call', ...over })

  it('accepts a task with only a title and a day', () => {
    expect(itemDraftError(draft({}))).toBeNull()
  })

  it('wants a title', () => {
    expect(itemDraftError(draft({ title: '  ' }))).toBe('Write a title.')
  })

  it('wants a start time for a meeting, and an end after the start', () => {
    expect(itemDraftError(draft({ kind: 'meeting' }))).toBe('A meeting needs a start time.')
    expect(itemDraftError(draft({ kind: 'meeting', startTime: '10:00', endTime: '09:00' }))).toBe(
      'The end time has to be after the start time.',
    )
    expect(
      itemDraftError(draft({ kind: 'meeting', startTime: '10:00', endTime: '11:00', zoomLink: 'https://zoom.us/j/1' })),
    ).toBeNull()
  })

  it('wants the Zoom link on a meeting, so it can be given to a parent', () => {
    expect(itemDraftError(draft({ kind: 'meeting', startTime: '10:00' }))).toBe(
      'Paste the Zoom link, starting with https://',
    )
    // A task or an event does not need one.
    expect(itemDraftError(draft({ kind: 'task' }))).toBeNull()
  })

  it('refuses a meeting link that is not a web address', () => {
    expect(itemDraftError(draft({ kind: 'meeting', startTime: '10:00', zoomLink: 'zoom link' }))).toBe(
      'The meeting link has to start with https://',
    )
  })
})

describe('buildCalendarItemEvents', () => {
  it('puts a task without a time on the day, and a meeting at its time', () => {
    const events = buildCalendarItemEvents(
      [item({}), item({ id: 2, kind: 'meeting', title: 'Parent meeting', startTime: '10:00', endTime: '11:00' })],
      () => null,
    )
    expect(events[0]).toMatchObject({ id: 'item-1', start: '2026-10-20', allDay: true, editable: false })
    expect(events[1]).toMatchObject({
      title: 'Zoom · Parent meeting',
      start: '2026-10-20T10:00:00',
      end: '2026-10-20T11:00:00',
      allDay: false,
    })
  })

  it('names who a task is given to and marks a done one', () => {
    const [open, done] = buildCalendarItemEvents(
      [item({ assigneeId: 4 }), item({ id: 2, isDone: true })],
      (id) => (id === 4 ? 'Mei' : null),
    )
    expect(open.title).toBe('☐ Call Mrs Tan (Mei)')
    expect(done.title).toBe('✓ Call Mrs Tan')
    expect(done.classNames).toContain('line-through')
  })
})

describe('itemsVisibleTo', () => {
  const items = [
    item({ id: 1, assigneeId: 5 }),
    item({ id: 2, assigneeId: 6 }),
    item({ id: 3, kind: 'event', assigneeId: null }),
  ]

  it('shows everything to someone who edits the calendar', () => {
    expect(itemsVisibleTo(items, { teacherId: 5, sees: 'all' })).toHaveLength(3)
  })

  it('shows anyone else their own items and the school-wide events', () => {
    expect(itemsVisibleTo(items, { teacherId: 5, sees: 'own' }).map((entry) => entry.id)).toEqual([1, 3])
  })
})
