import type { Schedule, TrialBooking } from '../types/domain'

// A trial booking names a slot (a weekly trial schedule) and a date. When the slot is later edited (another weekday,
// an earlier end date, turned into one day, cancelled) a booking can be left on a day the slot no longer runs: the
// calendar draws nothing for that day and the child is forgotten. These helpers find those bookings, so the form can
// refuse the edit and the calendar can show what is left over. The database refuses the same edit (migration
// 20261101700000_schedule_keeps_trial_bookings.sql).

// The part of a slot that decides which days it runs on.
export type SlotDays = Pick<Schedule, 'eventType' | 'dayOfWeek' | 'startRecur' | 'endRecur' | 'status'>

// 0 = Sunday, like the database's extract(dow ...).
function weekdayOf(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

// Whether the slot runs on that date: an active weekly schedule, on its weekday, between its first and last day.
export function slotRunsOn(slot: SlotDays, date: string) {
  return (
    slot.status === 'active' &&
    slot.eventType === 'regular' &&
    slot.dayOfWeek !== null &&
    weekdayOf(date) === slot.dayOfWeek &&
    slot.startRecur !== null &&
    date >= slot.startRecur &&
    (slot.endRecur === null || date <= slot.endRecur)
  )
}

type HasLog = (scheduleId: number, date: string) => boolean

// The bookings an edit of the slot would leave without a class: they fit the slot as it is now, not after the edit,
// and their day is today or later (a day with its attendance in is history and stays).
export function bookingsLeftBehind(
  bookings: TrialBooking[],
  scheduleId: number,
  before: SlotDays,
  after: SlotDays,
  today: string,
  hasLog: HasLog = () => false,
) {
  return bookings
    .filter(
      (booking) =>
        booking.scheduleId === scheduleId &&
        booking.bookingDate >= today &&
        !hasLog(scheduleId, booking.bookingDate) &&
        slotRunsOn(before, booking.bookingDate) &&
        !slotRunsOn(after, booking.bookingDate),
    )
    .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))
}

// The bookings that are on a day their slot does not run (an old edit, or an edit that bypassed the form), without
// attendance for that day. They are what the calendar shows in red.
export function orphanBookings(bookings: TrialBooking[], schedules: Schedule[], hasLog: HasLog = () => false) {
  const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  return bookings.filter((booking) => {
    const slot = byId.get(booking.scheduleId)
    return slot !== undefined && !slotRunsOn(slot, booking.bookingDate) && !hasLog(booking.scheduleId, booking.bookingDate)
  })
}

// "2 trial bookings would be left without a class (first: 2026-10-22). Move or cancel them first."
export function leftBehindMessage(count: number, firstDate: string) {
  return `${count} trial booking${count === 1 ? '' : 's'} would be left without a class (first: ${firstDate}). Move or cancel ${count === 1 ? 'it' : 'them'} first.`
}
