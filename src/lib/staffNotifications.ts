import { supabase } from './supabase'

// Notes a flow leaves for one person ("Notify staff" step). The database only lets each person read and mark
// their own, so the list is always the signed-in person's.

export type StaffNotification = {
  id: number
  title: string
  body: string
  leadId: number | null
  studentId: number | null
  flowId: number | null
  createdAt: string
  readAt: string | null
}

// The newest ones are enough for the bell; older notes stay in the database.
export const NOTIFICATION_LIMIT = 30

type Row = {
  id: number
  title: string
  body: string
  lead_id: number | null
  student_id: number | null
  flow_id: number | null
  created_at: string
  read_at: string | null
}

export function mapNotification(row: Row): StaffNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    leadId: row.lead_id,
    studentId: row.student_id,
    flowId: row.flow_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  }
}

// Null when the table is not there yet (before migration 20261029700000): then there is no bell.
export async function fetchStaffNotifications(): Promise<StaffNotification[] | null> {
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('staff_notifications')
    .select('id, title, body, lead_id, student_id, flow_id, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_LIMIT)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return null
    }
    throw error
  }
  return (data ?? []).map(mapNotification)
}

// Marks the given notes read (all of the person's unread ones when ids is null). Null when done, else the reason.
export async function markStaffNotificationsRead(ids: number[] | null): Promise<string | null> {
  if (!supabase) {
    return 'Not connected to the database.'
  }
  const { error } = await supabase.rpc('mark_staff_notifications_read', { p_ids: ids })
  return error ? error.message || 'Could not mark it read.' : null
}

// The text under the title: the database makes the title from the first line, so that line is not shown twice.
export function noteBody(note: Pick<StaffNotification, 'title' | 'body'>) {
  const [first, ...rest] = note.body.split('\n')
  return (first.trim() === note.title.trim() ? rest.join('\n') : note.body).trim()
}

// "just now", "5 min ago", "3 h ago", "2 d ago", then the date.
export function timeAgo(at: string, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} h ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 7) {
    return `${days} d ago`
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(
    new Date(at),
  )
}

const PANEL_WIDTH = 352
const GUTTER = 16

// Where the list goes: under the bell, its right edge at the bell's, but always inside the screen (on a phone
// the bell can sit on the left).
export function panelPlace(bell: { left: number; right: number; bottom: number }, screenWidth: number) {
  const width = Math.min(PANEL_WIDTH, screenWidth - 2 * GUTTER)
  const left = Math.min(Math.max(bell.right - width, GUTTER), screenWidth - width - GUTTER)
  return { top: bell.bottom + 8, left, width }
}
