import { supabase } from './supabase'

// Working hours: each person's fixed week, time off, extra time and swaps (docs/teams-permissions-design.md,
// section 7). Team Replies uses them to count only working time. Admin-only to change.

export type Shift = {
  id: number
  teacherId: number
  // 0 = Sunday ... 6 = Saturday.
  weekday: number
  start: string
  end: string
  effectiveFrom: string
  effectiveTo: string | null
}

export type RosterChange = {
  id: number
  teacherId: number
  startsAt: string
  endsAt: string
  change: 'off' | 'extra'
  reason: string | null
  swapId: string | null
  note: string | null
}

export type WeekTime = { weekday: number; start: string; end: string }

export type BusinessHours = { days: Record<string, { start: string; end: string }[]>; timeZone: string }

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Monday first, as the school's week reads.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const DEFAULT_TIME_ZONE = 'Asia/Kuala_Lumpur'
export const DEFAULT_LEAVE_REASONS = ['Annual leave', 'Sick leave', 'Off day', 'Swap']

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

const hhmm = (value: string) => value.slice(0, 5)

export async function fetchShifts(): Promise<Shift[]> {
  const { data, error } = await requireSupabase()
    .from('staff_shifts')
    .select('id, teacher_id, weekday, start_time, end_time, effective_from, effective_to')
    .order('weekday')
    .order('start_time')
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    teacherId: row.teacher_id,
    weekday: row.weekday,
    start: hhmm(row.start_time),
    end: row.end_time.startsWith('23:59') ? '24:00' : hhmm(row.end_time),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  }))
}

export async function fetchRosterChanges(fromIso: string, toIso: string): Promise<RosterChange[]> {
  const { data, error } = await requireSupabase()
    .from('staff_roster_changes')
    .select('id, teacher_id, starts_at, ends_at, change, reason, swap_id, note')
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at')
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    teacherId: row.teacher_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    change: row.change,
    reason: row.reason,
    swapId: row.swap_id,
    note: row.note,
  }))
}

// The week a person has on a day ("YYYY-MM-DD"), in day and time order.
export function weekOn(shifts: Shift[], teacherId: number, day: string): WeekTime[] {
  return shifts
    .filter((shift) => shift.teacherId === teacherId && shift.effectiveFrom <= day && (shift.effectiveTo === null || shift.effectiveTo >= day))
    .map((shift) => ({ weekday: shift.weekday, start: shift.start, end: shift.end }))
    .sort((a, b) => WEEK_ORDER.indexOf(a.weekday) - WEEK_ORDER.indexOf(b.weekday) || a.start.localeCompare(b.start))
}

// "Mon 09:00–18:00 · Tue 09:00–18:00", or "No set hours".
export function describeWeek(week: WeekTime[]) {
  if (week.length === 0) {
    return 'No set hours'
  }
  return week.map((time) => `${WEEKDAYS[time.weekday].slice(0, 3)} ${time.start}–${time.end}`).join(' · ')
}

export function weekError(week: WeekTime[]): string | null {
  for (const time of week) {
    if (!Number.isInteger(time.weekday) || time.weekday < 0 || time.weekday > 6) {
      return 'Pick a day for each time.'
    }
    if (!TIME.test(time.start) || !(TIME.test(time.end) || time.end === '24:00')) {
      return 'Write each time like 09:00.'
    }
    if (time.end !== '24:00' && time.end <= time.start) {
      return `${WEEKDAYS[time.weekday]}: the end must come after the start (a night shift is two times, before and after midnight).`
    }
  }
  const byDay = new Map<number, WeekTime[]>()
  for (const time of week) {
    byDay.set(time.weekday, [...(byDay.get(time.weekday) ?? []), time])
  }
  for (const [weekday, times] of byDay) {
    const sorted = [...times].sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].start < sorted[i - 1].end) {
        return `${WEEKDAYS[weekday]}: two times overlap.`
      }
    }
  }
  return null
}

// Has anyone working hours (or the school opening hours, or time off)? Team Replies then counts working time first.
export async function fetchHoursInUse(): Promise<boolean> {
  if (!supabase) {
    return false
  }
  try {
    const { data, error } = await supabase.rpc('team_hours_in_use')
    return !error && data === true
  } catch {
    // No answer (offline, or a database before 20261026030000): count the whole clock, as before.
    return false
  }
}

export async function saveStaffWeek(teacherId: number, week: WeekTime[], from: string | null) {
  const { error } = await requireSupabase().rpc('save_staff_week', {
    p_teacher_id: teacherId,
    p_shifts: week.map((time) => ({ weekday: time.weekday, start: time.start, end: time.end })),
    p_from: from,
  })
  if (error) {
    throw error
  }
}

// The moment a school's date and time stands for, as an ISO string with its offset ("2026-10-20T09:00:00+08:00").
export function zonedIso(day: string, time: string, timeZone = DEFAULT_TIME_ZONE) {
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = (time === '24:00' ? '00:00' : time).split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d + (time === '24:00' ? 1 : 0), hh, mm)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(guess))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  const offsetMinutes = Math.round((shown - guess) / 60000)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  const local = new Date(guess)
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export type RosterDraft = {
  kind: 'off' | 'extra' | 'swap'
  teacherId: number | null
  // The one who works instead (a swap).
  otherTeacherId: number | null
  fromDay: string
  fromTime: string
  toDay: string
  toTime: string
  reason: string
  note: string
}

export function rosterDraftError(draft: RosterDraft): string | null {
  if (draft.teacherId === null) {
    return 'Pick the person.'
  }
  if (draft.kind === 'swap' && (draft.otherTeacherId === null || draft.otherTeacherId === draft.teacherId)) {
    return 'Pick who works instead (another person).'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.toDay)) {
    return 'Pick the days.'
  }
  if (!(TIME.test(draft.fromTime) || draft.fromTime === '24:00') || !(TIME.test(draft.toTime) || draft.toTime === '24:00')) {
    return 'Write each time like 09:00.'
  }
  if (`${draft.toDay}T${draft.toTime}` <= `${draft.fromDay}T${draft.fromTime}`) {
    return 'The end must come after the start.'
  }
  if (draft.reason.length > 60 || draft.note.length > 300) {
    return 'The reason can have up to 60 letters and the note up to 300.'
  }
  return null
}

export async function saveRosterDraft(draft: RosterDraft, timeZone = DEFAULT_TIME_ZONE) {
  const db = requireSupabase()
  const startsAt = zonedIso(draft.fromDay, draft.fromTime, timeZone)
  const endsAt = zonedIso(draft.toDay, draft.toTime, timeZone)
  const reason = draft.reason.trim() || null
  const note = draft.note.trim() || null
  const { error } =
    draft.kind === 'swap'
      ? await db.rpc('add_shift_swap', {
          p_from_teacher_id: draft.teacherId!,
          p_to_teacher_id: draft.otherTeacherId!,
          p_starts_at: startsAt,
          p_ends_at: endsAt,
          p_reason: reason,
          p_note: note,
        })
      : await db.rpc('add_roster_change', {
          p_teacher_id: draft.teacherId!,
          p_starts_at: startsAt,
          p_ends_at: endsAt,
          p_change: draft.kind,
          p_reason: reason,
          p_note: note,
        })
  if (error) {
    throw error
  }
}

export async function deleteRosterChange(id: number) {
  const { error } = await requireSupabase().rpc('delete_roster_change', { p_id: id })
  if (error) {
    throw error
  }
}

function readSetting(rows: { key: string; value: unknown }[], key: string) {
  return rows.find((row) => row.key === key)?.value
}

export function parseBusinessHours(value: unknown): BusinessHours {
  const result: BusinessHours = { days: {}, timeZone: DEFAULT_TIME_ZONE }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result
  }
  const raw = value as { days?: unknown; time_zone?: unknown }
  if (typeof raw.time_zone === 'string' && raw.time_zone.trim() !== '') {
    result.timeZone = raw.time_zone
  }
  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    for (const [day, times] of Object.entries(raw.days as Record<string, unknown>)) {
      if (!/^[0-6]$/.test(day) || !Array.isArray(times)) continue
      const kept = times.filter(
        (time): time is { start: string; end: string } =>
          Boolean(time) && typeof time === 'object' && typeof (time as { start?: unknown }).start === 'string' && typeof (time as { end?: unknown }).end === 'string',
      )
      if (kept.length > 0) result.days[day] = kept.map((time) => ({ start: time.start, end: time.end }))
    }
  }
  return result
}

export function parseLeaveReasons(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_LEAVE_REASONS
  }
  const kept = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
  return kept.length > 0 ? kept : DEFAULT_LEAVE_REASONS
}

export async function fetchHoursSettings(): Promise<{ businessHours: BusinessHours; leaveReasons: string[] }> {
  const { data, error } = await requireSupabase().from('app_settings').select('key, value').in('key', ['business_hours', 'leave_reasons'])
  if (error) {
    throw error
  }
  const rows = (data ?? []) as { key: string; value: unknown }[]
  return {
    businessHours: parseBusinessHours(readSetting(rows, 'business_hours')),
    leaveReasons: parseLeaveReasons(readSetting(rows, 'leave_reasons')),
  }
}

export async function saveBusinessHours(hours: BusinessHours) {
  const { error } = await requireSupabase().rpc('set_business_hours', {
    p_value: { days: hours.days, time_zone: hours.timeZone },
  })
  if (error) {
    throw error
  }
}

export async function saveLeaveReasons(reasons: string[]) {
  const { error } = await requireSupabase().rpc('set_leave_reasons', { p_reasons: reasons.map((reason) => reason.trim()).filter(Boolean) })
  if (error) {
    throw error
  }
}
