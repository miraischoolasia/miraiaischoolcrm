import type { CalendarItem } from './calendarItems'

// A Zoom meeting already on the calendar that a parent can be put into, like an HOA class slot.
export type ZoomSlot = {
  // The calendar item it comes from.
  id: number
  startsAt: Date
  // Empty when the meeting on the calendar has no link: the time is still offered.
  link: string
  title: string
}

// The Zoom meetings on the calendar that have a time and have not started yet, soonest first (a link is not needed).
export function upcomingZoomSlots(items: CalendarItem[], now: Date): ZoomSlot[] {
  return items
    .flatMap((item) => {
      if (item.kind !== 'meeting' || !item.startTime) {
        return []
      }
      const startsAt = new Date(`${item.date}T${item.startTime}:00`)
      if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < now.getTime()) {
        return []
      }
      return [{ id: item.id, startsAt, link: item.zoomLink?.trim() ?? '', title: item.title }]
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id - b.id)
}
