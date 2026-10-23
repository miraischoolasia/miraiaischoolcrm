import type { EventInput } from '@fullcalendar/core'
import { supabase } from './supabase'
import { readAllRows } from './readAllRows'

export type CalendarItemKind = 'task' | 'meeting' | 'event'

export const CALENDAR_ITEM_KINDS: { key: CalendarItemKind; label: string; hint: string }[] = [
  { key: 'task', label: 'Task', hint: 'Something to do. Can be given to a person and ticked off.' },
  { key: 'meeting', label: 'Zoom meeting', hint: 'A meeting at a time, with the link.' },
  { key: 'event', label: 'Event', hint: 'A reminder, a closed day or a deadline.' },
]

// What each kind looks like on the calendar.
export const CALENDAR_ITEM_COLORS: Record<CalendarItemKind, { background: string; border: string; text: string }> = {
  task: { background: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  meeting: { background: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  event: { background: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
}

export type CalendarItem = {
  id: number
  kind: CalendarItemKind
  title: string
  notes: string | null
  // YYYY-MM-DD
  date: string
  // HH:MM, or null for an all-day item.
  startTime: string | null
  endTime: string | null
  zoomLink: string | null
  assigneeId: number | null
  leadId: number | null
  isDone: boolean
  createdBy: number | null
  // The weekly rule this item comes from, and the day it was written for. Null for a plain item.
  seriesId?: number | null
  seriesDate?: string | null
}

// How a new item repeats: on which days (ISO: 1 = Monday ... 7 = Sunday), until which day ('' = never).
export type RepeatRule = { weekdays: number[]; until: string }

// For an item that belongs to a weekly rule: change/delete only this day, or this day and all the ones after.
export type SeriesScope = 'one' | 'upcoming'

export type CalendarSaveOptions = { repeat?: RepeatRule | null; scope?: SeriesScope }

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// 1 = Monday ... 7 = Sunday, for a YYYY-MM-DD day.
export function isoWeekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00`).getDay()
  return day === 0 ? 7 : day
}

// What the form holds; the times are empty text for an all-day item.
export type CalendarItemDraft = {
  kind: CalendarItemKind
  title: string
  notes: string
  date: string
  startTime: string
  endTime: string
  zoomLink: string
  assigneeId: number | null
  isDone: boolean
  // The lead a task is a follow-up for (set from the Inbox); the calendar form leaves it alone.
  leadId?: number | null
}

export function emptyItemDraft(date: string, kind: CalendarItemKind = 'task'): CalendarItemDraft {
  return { kind, title: '', notes: '', date, startTime: '', endTime: '', zoomLink: '', assigneeId: null, isDone: false }
}

export function draftOfItem(item: CalendarItem): CalendarItemDraft {
  return {
    kind: item.kind,
    title: item.title,
    notes: item.notes ?? '',
    date: item.date,
    startTime: item.startTime ?? '',
    endTime: item.endTime ?? '',
    zoomLink: item.zoomLink ?? '',
    assigneeId: item.assigneeId,
    isDone: item.isDone,
    leadId: item.leadId,
  }
}

// A plain sentence for what is wrong with the form, or null when it can be saved.
export function itemDraftError(draft: CalendarItemDraft): string | null {
  if (!draft.title.trim()) {
    return 'Write a title.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    return 'Pick the day.'
  }
  if (draft.endTime && !draft.startTime) {
    return 'Add a start time, or clear the end time.'
  }
  if (draft.startTime && draft.endTime && draft.endTime <= draft.startTime) {
    return 'The end time has to be after the start time.'
  }
  if (draft.kind === 'meeting' && !draft.startTime) {
    return 'A meeting needs a start time.'
  }
  const link = draft.zoomLink.trim()
  if (link && !/^https?:\/\/\S+$/i.test(link)) {
    return 'The meeting link has to start with https://'
  }
  return null
}

type Row = {
  id: number
  kind: CalendarItemKind
  title: string
  notes: string | null
  item_date: string
  start_time: string | null
  end_time: string | null
  zoom_link: string | null
  assignee_id: number | null
  lead_id: number | null
  is_done: boolean
  created_by: number | null
  series_id: number | null
  series_date: string | null
}

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null)

function toItem(row: Row): CalendarItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    date: row.item_date,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    zoomLink: row.zoom_link,
    assigneeId: row.assignee_id,
    leadId: row.lead_id,
    isDone: row.is_done,
    createdBy: row.created_by,
    seriesId: row.series_id ?? null,
    seriesDate: row.series_date ?? null,
  }
}

const COLUMNS =
  'id, kind, title, notes, item_date, start_time, end_time, zoom_link, assignee_id, lead_id, is_done, created_by, series_id, series_date'

export async function fetchCalendarItems(): Promise<CalendarItem[]> {
  if (!supabase) {
    return []
  }
  const client = supabase
  // In pages: the API answers at most 1000 rows at a time, and weekly rules write many rows.
  const { data, error } = await readAllRows<Row>(
    (from, to, withCount) =>
      client
        .from('calendar_items')
        .select(COLUMNS, withCount ? { count: 'exact' } : undefined)
        .order('item_date')
        .order('start_time')
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { code?: string } | null; count?: number | null }>,
  )
  if (error) {
    throw error
  }
  return data.map(toItem)
}

// Writes the coming weeks of every weekly rule that has run short (the database also does it every night).
export async function topUpCalendarSeries(): Promise<void> {
  if (!supabase) {
    return
  }
  await supabase.rpc('calendar_series_extend')
}

function payloadOf(draft: CalendarItemDraft) {
  const hasTime = Boolean(draft.startTime)
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    notes: draft.notes.trim() || null,
    item_date: draft.date,
    start_time: hasTime ? draft.startTime : null,
    end_time: hasTime && draft.endTime ? draft.endTime : null,
    zoom_link: draft.kind === 'meeting' ? draft.zoomLink.trim() || null : null,
    assignee_id: draft.assigneeId,
    is_done: draft.kind === 'task' ? draft.isDone : false,
    ...(draft.leadId !== undefined ? { lead_id: draft.leadId } : {}),
  }
}

export function repeatError(draft: CalendarItemDraft, repeat: RepeatRule): string | null {
  if (repeat.weekdays.length === 0) {
    return 'Pick at least one day of the week to repeat on.'
  }
  if (repeat.until && !/^\d{4}-\d{2}-\d{2}$/.test(repeat.until)) {
    return 'Pick the last day, or leave it empty to repeat with no end.'
  }
  if (repeat.until && repeat.until < draft.date) {
    return 'The last day has to be on or after the first day.'
  }
  return null
}

export async function saveCalendarItem(
  existing: CalendarItem | null,
  draft: CalendarItemDraft,
  createdBy: number | null,
  options: CalendarSaveOptions = {},
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const payload = payloadOf(draft)
  if (!existing && options.repeat) {
    const { error } = await supabase.rpc('calendar_series_create', {
      p_kind: payload.kind,
      p_title: payload.title,
      p_notes: payload.notes,
      p_start_date: draft.date,
      p_weekdays: [...options.repeat.weekdays].sort((a, b) => a - b),
      p_start_time: payload.start_time,
      p_end_time: payload.end_time,
      p_zoom_link: payload.zoom_link,
      p_assignee_id: payload.assignee_id,
      p_until_date: options.repeat.until || null,
    })
    if (error) {
      throw error
    }
    return
  }
  if (existing?.seriesId != null && options.scope === 'upcoming') {
    // This day and all the ones after: the rule itself changes, and so do its coming days.
    const { error } = await supabase.rpc('calendar_series_update', {
      p_series_id: existing.seriesId,
      p_patch: {
        title: payload.title,
        notes: payload.notes,
        start_time: payload.start_time,
        end_time: payload.end_time,
        zoom_link: payload.zoom_link,
        assignee_id: payload.assignee_id,
      },
      p_from_date: existing.date,
    })
    if (error) {
      throw error
    }
    return
  }
  const { error } = existing
    ? await supabase.from('calendar_items').update(payload).eq('id', existing.id)
    : await supabase.from('calendar_items').insert({ ...payload, created_by: createdBy })
  if (error) {
    throw error
  }
}

export async function setCalendarItemDone(id: number, isDone: boolean): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const { error } = await supabase.from('calendar_items').update({ is_done: isDone }).eq('id', id)
  if (error) {
    throw error
  }
}

export async function deleteCalendarItem(id: number): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const { error } = await supabase.from('calendar_items').delete().eq('id', id)
  if (error) {
    throw error
  }
}

// Deletes an item of a weekly rule: this day only (the day is remembered so it is not written again), or this day and
// every one after it.
export async function deleteCalendarSeriesItem(item: CalendarItem, scope: SeriesScope): Promise<void> {
  if (scope === 'upcoming' && item.seriesId != null) {
    if (!supabase) {
      throw new Error('Supabase is not configured.')
    }
    const { error } = await supabase.rpc('calendar_series_delete', { p_series_id: item.seriesId, p_from_date: item.date })
    if (error) {
      throw error
    }
    return
  }
  await deleteCalendarItem(item.id)
}

// A Zoom meeting typed in for one parent (not picked from the calendar) is written on the calendar too, with the
// parent's lead, so the team sees it. Resolves to the new item's id.
export async function createLeadMeetingItem(input: {
  leadId: number
  startsAt: Date
  link: string
  createdBy: number | null
}): Promise<number> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const { date, time } = localDateAndTime(input.startsAt)
  const { data, error } = await supabase
    .from('calendar_items')
    .insert({
      kind: 'meeting',
      title: 'Zoom meeting with a parent',
      item_date: date,
      start_time: time,
      zoom_link: input.link.trim() || null,
      lead_id: input.leadId,
      created_by: input.createdBy,
    })
    .select('id')
    .single()
  if (error) {
    throw error
  }
  return data.id as number
}

// Moves the calendar entry made for one parent's meeting. Only an entry that belongs to this lead is touched, never a
// shared slot another parent may also be in.
export async function moveLeadMeetingItem(itemId: number, leadId: number, startsAt: Date, link: string): Promise<void> {
  if (!supabase) {
    return
  }
  const { date, time } = localDateAndTime(startsAt)
  await supabase
    .from('calendar_items')
    .update({ item_date: date, start_time: time, zoom_link: link.trim() || null })
    .eq('id', itemId)
    .eq('lead_id', leadId)
}

export async function deleteLeadMeetingItem(itemId: number, leadId: number): Promise<void> {
  if (!supabase) {
    return
  }
  await supabase.from('calendar_items').delete().eq('id', itemId).eq('lead_id', leadId)
}

function localDateAndTime(at: Date): { date: string; time: string } {
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  }
}

// The items as calendar events. A task with no time sits on the day (all day); a done task is dimmed and
// struck through by its class name.
export function buildCalendarItemEvents(items: CalendarItem[], assigneeName: (id: number | null) => string | null): EventInput[] {
  return items.map((item) => {
    const colors = CALENDAR_ITEM_COLORS[item.kind]
    const timed = item.startTime !== null
    const prefix = item.kind === 'task' ? (item.isDone ? '✓ ' : '☐ ') : item.kind === 'meeting' ? 'Zoom · ' : ''
    const who = item.kind === 'task' ? assigneeName(item.assigneeId) : null
    return {
      id: `item-${item.id}`,
      title: `${prefix}${item.title}${who ? ` (${who})` : ''}`,
      start: timed ? `${item.date}T${item.startTime}:00` : item.date,
      end: timed && item.endTime ? `${item.date}T${item.endTime}:00` : undefined,
      allDay: !timed,
      backgroundColor: colors.background,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: item.kind === 'task' && item.isDone ? ['opacity-60', 'line-through'] : [],
      // Not a class: it cannot be dragged to another day like one.
      editable: false,
      startEditable: false,
      extendedProps: { calendarItemId: item.id, calendarItemKind: item.kind },
    }
  })
}

// Who sees an item on their calendar: everyone who may edit it, otherwise the person it is given to and
// everyone for a school-wide event.
export function itemsVisibleTo(items: CalendarItem[], viewer: { teacherId: number | null; sees: 'all' | 'own' }) {
  if (viewer.sees === 'all') {
    return items
  }
  return items.filter((item) => item.kind === 'event' || item.assigneeId === viewer.teacherId)
}
