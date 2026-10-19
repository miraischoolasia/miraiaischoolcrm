import { supabase } from './supabase'
import type { Schedule } from '../types/domain'

// How the Calendar page shows a day (Class Settings > Calendar; migration 20261025400000).
// auto: the day list for a school with many classes a day, the month calendar for one with few.
export type CalendarLayout = 'auto' | 'classic' | 'day_list'

// A school whose busiest weekday has this many classes or more gets the day list on "auto": a month
// calendar cannot show them (EduHero has 15-45 a day; Mirai has a few).
export const DAY_LIST_FROM_CLASSES = 12

export function readCalendarLayout(value: unknown): CalendarLayout {
  return value === 'classic' || value === 'day_list' ? value : 'auto'
}

// The most weekly classes on any one weekday.
export function busiestWeekdayClasses(schedules: Pick<Schedule, 'status' | 'eventType' | 'dayOfWeek'>[]) {
  const perDay = new Map<number, number>()
  for (const schedule of schedules) {
    if (schedule.status === 'active' && schedule.eventType === 'regular' && schedule.dayOfWeek !== null) {
      perDay.set(schedule.dayOfWeek, (perDay.get(schedule.dayOfWeek) ?? 0) + 1)
    }
  }
  return Math.max(0, ...perDay.values())
}

export function usesDayList(layout: CalendarLayout, schedules: Pick<Schedule, 'status' | 'eventType' | 'dayOfWeek'>[]) {
  if (layout !== 'auto') return layout === 'day_list'
  return busiestWeekdayClasses(schedules) >= DAY_LIST_FROM_CLASSES
}

// Not readable (no setting yet, offline): automatic.
export async function fetchCalendarLayout(): Promise<CalendarLayout> {
  if (!supabase) return 'auto'
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'calendar_layout').maybeSingle()
    return readCalendarLayout(data?.value)
  } catch {
    return 'auto'
  }
}

export async function saveCalendarLayout(layout: CalendarLayout) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_calendar_layout', { p_layout: layout })
  return error ? error.message || 'Failed to save.' : null
}
