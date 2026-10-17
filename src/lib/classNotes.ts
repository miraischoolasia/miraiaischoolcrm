import { supabase } from './supabase'

// Notes the teacher jots about a child during a lesson
// (20261023110000_class_session_notes.sql). Staff only; the attendance form
// can copy them into each child's lesson remark.

export async function fetchClassNotes(sessionId: number): Promise<Map<number, string>> {
  if (!supabase) return new Map()
  const { data, error } = await supabase.from('class_session_notes').select('student_id, note').eq('session_id', sessionId)
  if (error) throw new Error(error.message || 'Could not read the notes.')
  return new Map((data ?? []).map((row) => [row.student_id, row.note]))
}

// The notes of the lesson on that day (for the attendance form).
export async function fetchClassNotesFor(scheduleId: number, lessonDate: string): Promise<Map<number, string>> {
  if (!supabase) return new Map()
  const { data: session } = await supabase
    .from('class_sessions')
    .select('id')
    .eq('schedule_id', scheduleId)
    .eq('lesson_date', lessonDate)
    .maybeSingle()
  return session ? fetchClassNotes(session.id) : new Map()
}

// An empty note removes it. Resolves to an error message, or null.
export async function saveClassNote(sessionId: number, studentId: number, note: string) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_class_session_note', { p_session_id: sessionId, p_student_id: studentId, p_note: note })
  return error ? error.message || 'Could not save the note.' : null
}

// Adds the lesson's notes to the lesson remarks: an empty remark takes the
// note; a remark that already holds the note is left alone; otherwise the
// note goes on a new line. Returns only the remarks that change.
export function remarksWithNotes(notes: Map<number, string>, remarkOf: (studentId: number) => string, studentIds: number[]) {
  const changes = new Map<number, string>()
  for (const studentId of studentIds) {
    const note = notes.get(studentId)?.trim()
    if (!note) continue
    const remark = remarkOf(studentId).trim()
    if (remark.includes(note)) continue
    changes.set(studentId, remark ? `${remark}\n${note}` : note)
  }
  return changes
}
