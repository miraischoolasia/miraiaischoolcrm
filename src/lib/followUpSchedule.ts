import { supabase } from './supabase'

// The school's automatic follow-up schedule (app_settings 'followup_schedule', 20261102500000): on which days after a
// lead came in it is followed up, at what time, and after how many quiet days a parent who writes again starts a new
// round. Without the row (or the database update) the defaults are used.
export type FollowUpSchedule = {
  enabled: boolean
  days: number[]
  // HH:MM, Malaysian time.
  time: string
  round2AfterDays: number
}

export const DEFAULT_FOLLOW_UP_SCHEDULE: FollowUpSchedule = { enabled: true, days: [1, 2, 4, 10, 30], time: '10:00', round2AfterDays: 14 }

export const MAX_FOLLOW_UP_STEPS = 8

export function readFollowUpSchedule(value: unknown): FollowUpSchedule {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const days = Array.isArray(row.days) && row.days.every((day) => Number.isInteger(day)) ? (row.days as number[]) : DEFAULT_FOLLOW_UP_SCHEDULE.days
  return {
    enabled: typeof row.enabled === 'boolean' ? row.enabled : DEFAULT_FOLLOW_UP_SCHEDULE.enabled,
    days,
    time: typeof row.time === 'string' && /^\d{2}:\d{2}$/.test(row.time) ? row.time : DEFAULT_FOLLOW_UP_SCHEDULE.time,
    round2AfterDays: Number.isInteger(row.round2_after_days) ? (row.round2_after_days as number) : DEFAULT_FOLLOW_UP_SCHEDULE.round2AfterDays,
  }
}

// What is wrong with a schedule, or null when it can be saved (the database checks the same).
export function followUpScheduleError(schedule: FollowUpSchedule): string | null {
  if (schedule.days.length === 0 || schedule.days.length > MAX_FOLLOW_UP_STEPS) {
    return `Keep 1 to ${MAX_FOLLOW_UP_STEPS} follow-ups.`
  }
  for (let index = 0; index < schedule.days.length; index += 1) {
    const day = schedule.days[index]
    if (!Number.isInteger(day) || day < 0 || day > 365) {
      return 'Each follow-up day is a whole number from 0 to 365.'
    }
    if (index > 0 && day <= schedule.days[index - 1]) {
      return 'Each follow-up has to be later than the one before.'
    }
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) {
    return 'Pick the time.'
  }
  if (!Number.isInteger(schedule.round2AfterDays) || schedule.round2AfterDays < 1 || schedule.round2AfterDays > 365) {
    return 'The quiet days before a new round are 1 to 365.'
  }
  return null
}

export async function fetchFollowUpSchedule(): Promise<FollowUpSchedule> {
  if (!supabase) {
    return DEFAULT_FOLLOW_UP_SCHEDULE
  }
  try {
    const { data, error } = await supabase.rpc('followup_schedule' as never)
    return error ? DEFAULT_FOLLOW_UP_SCHEDULE : readFollowUpSchedule(data)
  } catch {
    return DEFAULT_FOLLOW_UP_SCHEDULE
  }
}

// Resolves to an error message, or null when saved.
export async function saveFollowUpSchedule(schedule: FollowUpSchedule): Promise<string | null> {
  const problem = followUpScheduleError(schedule)
  if (problem) {
    return problem
  }
  if (!supabase) {
    return 'Supabase is not configured.'
  }
  const { error } = await supabase.rpc('set_followup_schedule' as never, {
    p_value: { enabled: schedule.enabled, days: schedule.days, time: schedule.time, round2_after_days: schedule.round2AfterDays },
  } as never)
  if (!error) {
    return null
  }
  return error.code === 'PGRST202' || error.code === '42883'
    ? 'Automatic follow-ups need the database update first.'
    : error.message || 'Failed to save.'
}
