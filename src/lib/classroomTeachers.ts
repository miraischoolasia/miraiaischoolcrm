import { supabase } from './supabase'
import type { Classroom } from '../types/domain'

// A class can have several teachers; teacherId is the main one.

// Everyone who teaches the class, the main teacher first.
export function classroomTeacherIds(classroom: Pick<Classroom, 'teacherId' | 'teacherIds'>) {
  const ids = classroom.teacherIds ?? []
  const main = classroom.teacherId
  return main ? [main, ...ids.filter((id) => id !== main)] : ids
}

export function teachesClassroom(classroom: Pick<Classroom, 'teacherId' | 'teacherIds'>, teacherId: number | null | undefined) {
  return teacherId !== null && teacherId !== undefined && classroomTeacherIds(classroom).includes(teacherId)
}

// The main teacher stays main while listed; otherwise the first listed becomes main.
export async function saveClassroomTeachers(classroomId: number, teacherIds: number[]) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_classroom_teachers', { p_classroom_id: classroomId, p_teacher_ids: teacherIds })
  return error ? error.message || 'Could not save the teachers.' : null
}
