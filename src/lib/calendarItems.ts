import type { EventInput } from '@fullcalendar/core'
import { supabase } from './supabase'

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
  }
}

const COLUMNS =
  'id, kind, title, notes, item_date, start_time, end_time, zoom_link, assignee_id, lead_id, is_done, created_by'

export async function fetchCalendarItems(): Promise<CalendarItem[]> {
  if (!supabase) {
    return []
  }
  const { data, error } = await supabase.from('calendar_items').select(COLUMNS).order('item_date').order('start_time')
  if (error) {
    throw error
  }
  return ((data ?? []) as Row[]).map(toItem)
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
  }
}

export async function saveCalendarItem(
  existing: CalendarItem | null,
  draft: CalendarItemDraft,
  createdBy: number | null,
): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  const payload = payloadOf(draft)
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
