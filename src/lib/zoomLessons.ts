import { supabase } from './supabase'

// A lesson's own Zoom meeting (20261022060000_zoom_lessons.sql and the
// zoom-lesson function): make it, sign the children up, start it as host,
// and read the minutes each child was in it.

export type LessonZoom = {
  sessionId: number | null
  meeting: { meetingId: string; joinUrl: string | null; host: string | null } | null
  // Children with a link of their own.
  linked: number
}

export async function fetchLessonZoom(scheduleId: number, lessonDate: string): Promise<LessonZoom> {
  const empty: LessonZoom = { sessionId: null, meeting: null, linked: 0 }
  if (!supabase) return empty
  const { data: session } = await supabase
    .from('class_sessions')
    .select('id')
    .eq('schedule_id', scheduleId)
    .eq('lesson_date', lessonDate)
    .maybeSingle()
  if (!session) return empty
  const [{ data: zoom }, { count }] = await Promise.all([
    supabase.from('class_session_zoom').select('meeting_id, join_url, host_user').eq('session_id', session.id).maybeSingle(),
    supabase.from('class_session_zoom_links').select('student_id', { count: 'exact', head: true }).eq('session_id', session.id),
  ])
  return {
    sessionId: session.id,
    meeting: zoom ? { meetingId: zoom.meeting_id, joinUrl: zoom.join_url, host: zoom.host_user } : null,
    linked: count ?? 0,
  }
}

async function callZoom(action: 'prepare' | 'start', scheduleId: number, lessonDate: string) {
  if (!supabase) return { error: 'Supabase is not configured.', data: null }
  const { data, error } = await supabase.functions.invoke('zoom-lesson', { body: { action, scheduleId, lessonDate } })
  if (error) {
    let reason = error.message || 'Zoom did not answer.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) reason = body.error
    } catch {
      // keep the general reason
    }
    return { error: reason, data: null }
  }
  if (!data?.ok) return { error: data?.error ?? 'Zoom did not answer.', data: null }
  return { error: null, data }
}

// Makes the meeting if there is none and signs up the children without a link.
export async function prepareLessonZoom(scheduleId: number, lessonDate: string) {
  const { error, data } = await callZoom('prepare', scheduleId, lessonDate)
  if (error) return { error, problems: [] as string[] }
  return { error: null, problems: (data.problems ?? []) as string[] }
}

// A fresh link for the host to start the meeting.
export async function lessonZoomHostUrl(scheduleId: number, lessonDate: string) {
  const { error, data } = await callZoom('start', scheduleId, lessonDate)
  return { error, url: (data?.startUrl as string | null) ?? null }
}

export type ZoomMinutes = { studentId: number; minutes: number; countsAsPresent: boolean }

export async function fetchLessonZoomMinutes(scheduleId: number, lessonDate: string): Promise<ZoomMinutes[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('lesson_zoom_minutes', { p_schedule_id: scheduleId, p_lesson_date: lessonDate })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ studentId: row.student_id, minutes: row.minutes, countsAsPresent: row.counts_as_present }))
}
