import { supabase } from './supabase'

// Every schedules column the CRM reads, the lesson's own links included
// (schedules.fb_group_url / zoom_link, migration 20261025200000).
export const SCHEDULE_SELECT =
  'id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes, fb_group_url, zoom_link'

// A link typed into the lesson form: trimmed, "www.…" gets https://, empty is
// null. Anything that is still not a single web address is an error.
export function normalizeLessonLink(value: string | undefined): { link: string | null; error: string | null } {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return { link: null, error: null }
  const link = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  if (!/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(link)) return { link: null, error: 'is not a web link' }
  return { link, error: null }
}

// The fixed Zoom link of a lesson: its own first, else the class's.
export function lessonFixedZoomLink(
  schedule: { zoomLink?: string | null } | null | undefined,
  classroom: { zoomLink?: string | null } | null | undefined,
): string | null {
  return schedule?.zoomLink?.trim() || classroom?.zoomLink?.trim() || null
}

// Who teaches a weekly lesson and what it is called when the form is saved.
// A class can hold several teachers' lessons (Class > Teachers), so an
// existing lesson keeps its own teacher and name while it stays in the same
// class and that teacher still teaches the class; otherwise it follows the
// class's main teacher and name, as a new lesson does.
export function regularLessonOwner(
  classroom: { id: number; name: string; teacherId: number | null; teacherIds?: number[] },
  existing: { classroomId: number | null; teacherId: number; title: string } | null,
): { teacherId: number | null; title: string } {
  const keeps =
    existing !== null &&
    existing.classroomId === classroom.id &&
    existing.teacherId !== classroom.teacherId &&
    (classroom.teacherIds ?? []).includes(existing.teacherId)
  return keeps
    ? { teacherId: existing.teacherId, title: existing.title }
    : { teacherId: classroom.teacherId, title: existing?.classroomId === classroom.id ? existing.title : classroom.name }
}

// The teacher console's fallback when the CRM has made no meeting for the day.
export async function fetchLessonFixedZoomLink(scheduleId: number): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('schedules')
    .select('zoom_link, classrooms(zoom_link)')
    .eq('id', scheduleId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { zoom_link: string | null; classrooms: { zoom_link: string | null } | null }
  return lessonFixedZoomLink({ zoomLink: row.zoom_link }, { zoomLink: row.classrooms?.zoom_link ?? null })
}
