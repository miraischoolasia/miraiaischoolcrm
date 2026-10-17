import type { CalendarItem, CalendarItemDraft } from './calendarItems'

// A follow-up is a task on the calendar that is tied to a lead (calendar_items.lead_id): a day and a time at
// which someone should write to the parent again. Everything here is plain functions on those items, with
// the clock passed in, so it can be tested.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (value: number) => String(value).padStart(2, '0')

export function dateKeyOf(moment: Date) {
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
}

export function timeOf(moment: Date) {
  return `${pad(moment.getHours())}:${pad(moment.getMinutes())}`
}

function atTime(day: Date, hour: number, minute = 0) {
  const moment = new Date(day)
  moment.setHours(hour, minute, 0, 0)
  return moment
}

function addDaysTo(day: Date, days: number) {
  const moment = new Date(day)
  moment.setDate(moment.getDate() + days)
  return moment
}

function parseDay(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export type FollowUpChoice = { key: string; label: string; date: string; time: string }

// The quick choices under the date picker. "Tonight" is left out once it is too late for it to mean anything.
export function followUpChoices(now: Date): FollowUpChoice[] {
  const choices: FollowUpChoice[] = []
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000)
  choices.push({ key: 'hour', label: 'In 1 hour', date: dateKeyOf(inAnHour), time: timeOf(inAnHour) })
  const tonight = atTime(now, 20)
  if (tonight.getTime() - now.getTime() > 90 * 60 * 1000) {
    choices.push({ key: 'tonight', label: 'Tonight 8:00 pm', date: dateKeyOf(tonight), time: '20:00' })
  }
  const tomorrow = addDaysTo(now, 1)
  choices.push({ key: 'tomorrow', label: 'Tomorrow 10:00 am', date: dateKeyOf(tomorrow), time: '10:00' })
  choices.push({ key: 'three', label: 'In 3 days', date: dateKeyOf(addDaysTo(now, 3)), time: '10:00' })
  const untilMonday = ((8 - now.getDay()) % 7) || 7
  choices.push({ key: 'monday', label: 'Next Monday', date: dateKeyOf(addDaysTo(now, untilMonday)), time: '10:00' })
  return choices
}

// The follow-ups nobody has ticked off yet for one lead, the soonest first.
export function openFollowUps(items: CalendarItem[], leadId: number | null): CalendarItem[] {
  if (leadId === null) {
    return []
  }
  return items
    .filter((item) => item.kind === 'task' && item.leadId === leadId && !item.isDone)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id - b.id)
}

// The moment a follow-up is due. One with no time is due from the start of its day.
export function dueMomentOf(item: Pick<CalendarItem, 'date' | 'startTime'>) {
  const day = parseDay(item.date)
  if (item.startTime) {
    const [hour, minute] = item.startTime.split(':').map(Number)
    return atTime(day, hour, minute)
  }
  return day
}

export type FollowUpState = 'late' | 'today' | 'later'

export function followUpState(item: Pick<CalendarItem, 'date' | 'startTime'>, now: Date): FollowUpState {
  if (dueMomentOf(item).getTime() <= now.getTime() && (item.startTime !== null || item.date < dateKeyOf(now))) {
    return 'late'
  }
  return item.date === dateKeyOf(now) ? 'today' : 'later'
}

// "Today 15:00", "Tomorrow 10:00", "Tue 21 Oct, 10:00"; no time is left out.
export function describeFollowUp(item: Pick<CalendarItem, 'date' | 'startTime'>, now: Date) {
  const day = parseDay(item.date)
  const today = dateKeyOf(now)
  const tomorrow = dateKeyOf(addDaysTo(now, 1))
  const dayText =
    item.date === today
      ? 'Today'
      : item.date === tomorrow
        ? 'Tomorrow'
        : `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`
  return item.startTime ? `${dayText}${item.date === today || item.date === tomorrow ? ' ' : ', '}${item.startTime}` : dayText
}

// A plain sentence for what is wrong, or null when the follow-up can be saved.
export function followUpError(date: string, time: string, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Pick the day.'
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return 'Pick the time.'
  }
  if (dueMomentOf({ date, startTime: time }).getTime() < now.getTime() - 60 * 1000) {
    return 'That time has already passed.'
  }
  return null
}

export function followUpDraft(input: {
  leadName: string
  date: string
  time: string
  note: string
  assigneeId: number | null
  leadId: number
}): CalendarItemDraft {
  const name = input.leadName.trim() || 'this lead'
  return {
    kind: 'task',
    title: `Follow up ${name}`.slice(0, 160),
    notes: input.note.trim(),
    date: input.date,
    startTime: input.time,
    endTime: '',
    zoomLink: '',
    assigneeId: input.assigneeId,
    isDone: false,
    leadId: input.leadId,
  }
}

// A follow-up has to ring for someone when it is theirs, tied to a lead, not ticked off, its time has come and
// it has not been put off. snoozedUntil maps a follow-up's id to the moment (ms) it may ring again.
export function dueFollowUps(
  items: CalendarItem[],
  meId: number | null,
  now: Date,
  snoozedUntil: Record<number, number> = {},
): CalendarItem[] {
  if (meId === null) {
    return []
  }
  return items
    .filter(
      (item) =>
        item.kind === 'task' &&
        item.leadId !== null &&
        !item.isDone &&
        item.assigneeId === meId &&
        dueMomentOf(item).getTime() <= now.getTime() &&
        (snoozedUntil[item.id] ?? 0) <= now.getTime(),
    )
    .sort((a, b) => dueMomentOf(a).getTime() - dueMomentOf(b).getTime() || a.id - b.id)
}

export type SnoozeChoice = { key: string; label: string; until: number }

// "Remind me again": in 10 minutes, in an hour, or tomorrow at 10:00.
export function snoozeChoices(now: Date): SnoozeChoice[] {
  return [
    { key: '10min', label: 'In 10 minutes', until: now.getTime() + 10 * 60 * 1000 },
    { key: 'hour', label: 'In 1 hour', until: now.getTime() + 60 * 60 * 1000 },
    { key: 'tomorrow', label: 'Tomorrow 10:00 am', until: atTime(addDaysTo(now, 1), 10).getTime() },
  ]
}

export type FollowUpRow = { id: number; leadId: number; title: string; notes: string | null; when: string; late: boolean }

// The signed-in person's follow-ups for the Today list: everything open that is due today or already late, the
// oldest first. (Later today ones are in, so the day can be planned; they just are not marked late.)
export function todaysFollowUps(items: CalendarItem[], meId: number | null, now: Date): FollowUpRow[] {
  if (meId === null) {
    return []
  }
  const today = dateKeyOf(now)
  return items
    .filter((item) => item.kind === 'task' && item.leadId !== null && !item.isDone && item.assigneeId === meId && item.date <= today)
    .sort((a, b) => dueMomentOf(a).getTime() - dueMomentOf(b).getTime() || a.id - b.id)
    .map((item) => ({
      id: item.id,
      leadId: item.leadId!,
      title: item.title,
      notes: item.notes,
      when: describeFollowUp(item, now),
      late: followUpState(item, now) === 'late',
    }))
}
