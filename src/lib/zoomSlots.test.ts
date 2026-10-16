import { describe, expect, it } from 'vitest'
import type { CalendarItem } from './calendarItems'
import { upcomingZoomSlots } from './zoomSlots'

function item(patch: Partial<CalendarItem> & Pick<CalendarItem, 'id'>): CalendarItem {
  return {
    kind: 'meeting',
    title: 'Parent Zoom',
    notes: null,
    date: '2026-10-20',
    startTime: '10:00',
    endTime: null,
    zoomLink: 'https://zoom.us/j/1',
    assigneeId: null,
    leadId: null,
    isDone: false,
    createdBy: null,
    ...patch,
  }
}

describe('upcomingZoomSlots', () => {
  const now = new Date('2026-10-16T08:00:00')

  it('lists only meetings that have a time and have not started, soonest first, with or without a link', () => {
    const slots = upcomingZoomSlots(
      [
        item({ id: 1, date: '2026-10-22' }),
        item({ id: 2, date: '2026-10-20', startTime: '15:30' }),
        item({ id: 3, date: '2026-10-10' }),
        item({ id: 4, startTime: null }),
        item({ id: 5, zoomLink: null }),
        item({ id: 6, kind: 'task' }),
      ],
      now,
    )
    expect(slots.map((slot) => slot.id)).toEqual([5, 2, 1])
    expect(slots[1].startsAt.getHours()).toBe(15)
    expect(slots[1].link).toBe('https://zoom.us/j/1')
    expect(slots[0].link).toBe('')
  })
})
