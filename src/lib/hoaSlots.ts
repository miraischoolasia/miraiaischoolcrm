import { parseLocalDate } from '../domain/studentStatus'
import type { Classroom, Schedule, ScheduleException, Teacher, TrialBooking } from '../types/domain'
import { isScheduleMeetingDate } from './makeup'
import { buildTrialBookingMap, getDateKeyFromDate, getScheduleClassKind, getTrialSlotKey } from './schedule'

// One HOA class on the calendar that a parent can still be booked into.
export type HoaSlot = {
  scheduleId: number
  date: string
  startTime: string
  endTime: string
  title: string
  teacherName: string
  // Children already booked into it.
  bookedCount: number
}

type Input = {
  schedules: Schedule[]
  classroomMap: Map<number, Classroom>
  teachers: Teacher[]
  exceptions: ScheduleException[]
  bookings: TrialBooking[]
  // Today as YYYY-MM-DD, and the time now as HH:MM; a class that has started is not offered.
  today: string
  nowTime: string
  days?: number
}

// The HOA classes of the next few weeks, taken from the same trial slots the calendar shows:
// not cancelled, not skipped for a holiday, and not yet started.
export function upcomingHoaSlots({
  schedules,
  classroomMap,
  teachers,
  exceptions,
  bookings,
  today,
  nowTime,
  days = 35,
}: Input): HoaSlot[] {
  const trialSchedules = schedules.filter(
    (schedule) => schedule.status === 'active' && getScheduleClassKind(schedule, classroomMap) === 'trial',
  )
  const teacherNames = new Map(teachers.map((teacher) => [teacher.id, teacher.fullName]))
  const bookingMap = buildTrialBookingMap(bookings)
  const slots: HoaSlot[] = []

  const day = parseLocalDate(today)
  for (let offset = 0; offset < days; offset += 1) {
    const date = getDateKeyFromDate(new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset))
    for (const schedule of trialSchedules) {
      if (!isScheduleMeetingDate(schedule, date, exceptions, true)) {
        continue
      }
      if (date === today && schedule.startTime.slice(0, 5) <= nowTime) {
        continue
      }
      slots.push({
        scheduleId: schedule.id,
        date,
        startTime: schedule.startTime.slice(0, 5),
        endTime: schedule.endTime.slice(0, 5),
        title: classroomMap.get(schedule.classroomId ?? -1)?.name ?? schedule.title,
        teacherName: teacherNames.get(schedule.teacherId) ?? 'Teacher',
        bookedCount: bookingMap.get(getTrialSlotKey(schedule.id, date))?.length ?? 0,
      })
    }
  }

  return slots.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
}

// "Sat 18 Oct, 10:00 to 12:00", how a parent reads a class time.
export function describeHoaSlot(slot: Pick<HoaSlot, 'date' | 'startTime' | 'endTime'>) {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    parseLocalDate(slot.date),
  )
  return `${day}, ${slot.startTime} to ${slot.endTime}`
}

// HOA classes are split by age ("HOA [9-11 Years Old]"). The ages the class is for, or null when
// its name does not say.
export function hoaAgeRange(title: string): { min: number; max: number } | null {
  const match = /(\d{1,2})\s*[-–]\s*(\d{1,2})/.exec(title)
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null
}

// True when the class is for a child of this age; a class with no age in its name is for anyone.
export function hoaSlotFitsAge(slot: Pick<HoaSlot, 'title'>, age: number | null) {
  const range = hoaAgeRange(slot.title)
  return !range || age === null || (age >= range.min && age <= range.max)
}

// The class name without the brackets it is written with on the calendar.
export function cleanHoaTitle(title: string) {
  return title.replace(/[【】]/g, '').replace(/\s+/g, ' ').trim()
}

// "14:00" -> "2pm", "16:30" -> "4.30pm": how the school writes a time to a parent.
export function formatClockForParent(time: string) {
  const [hourText, minuteText = '00'] = time.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return time
  }
  const suffix = hour >= 12 ? 'pm' : 'am'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}.${String(minute).padStart(2, '0')}${suffix}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The classes the AI reply suggestion may offer a parent: the calendar's open HOA classes that fit the
// age of a child on the chat (every class when no age is known), soonest first, one readable line each.
export function hoaSlotLinesForAi(slots: HoaSlot[], childAges: (number | null)[], limit = 12): string[] {
  const ages = childAges.filter((age): age is number => age !== null)
  const fitting = ages.length === 0 ? slots : slots.filter((slot) => ages.some((age) => hoaSlotFitsAge(slot, age)))
  return fitting.slice(0, limit).map((slot) => {
    const date = parseLocalDate(slot.date)
    const day = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
    const time = `${formatClockForParent(slot.startTime)} to ${formatClockForParent(slot.endTime)}`
    return `${day}, ${time}, ${cleanHoaTitle(slot.title)}`
  })
}
