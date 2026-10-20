import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'

// Tags on students and parents (20261028000000_student_family_tags.sql). They are the same tags the leads
// use (lead_options, kind 'tag'); a person's tags are kept on the family table (people.tag_ids). Before the
// database update nothing here finds anything, and the page loads as before.

// "Has no tags" in the student list's tag filter.
export const NO_TAG = '__none'

const PAGE = 1000

// The tags of every enrolled student that has any, read 1000 at a time: student id -> tag ids.
export async function fetchStudentTags(): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>()
  if (!supabase) return result
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('people')
        .select('student_id, tag_ids')
        .not('student_id', 'is', null)
        .neq('tag_ids', '{}' as unknown as number[])
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) return result
      for (const row of data ?? []) {
        if (row.student_id !== null) result.set(row.student_id, row.tag_ids ?? [])
      }
      if ((data ?? []).length < PAGE) return result
    }
  } catch {
    return result
  }
}

function reason(error: { code?: string; message?: string }, fallback: string) {
  return isMissingDatabaseThing(error) ? 'Tags can not be saved until the database update for them is applied.' : error.message || fallback
}

// Null when saved, else the reason.
export async function setStudentTags(studentId: number, tagIds: number[]) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_student_tags', { p_student_id: studentId, p_tag_ids: tagIds })
  return error ? reason(error, 'Could not save the tags.') : null
}

export async function setPersonTags(personId: number, tagIds: number[]) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_person_tags', { p_person_id: personId, p_tag_ids: tagIds })
  return error ? reason(error, 'Could not save the tags.') : null
}

// The student list's tag filter: '' = every student, NO_TAG = students without a tag, else one tag id.
export function matchesTagFilter(tagIds: number[] | undefined, filter: string) {
  if (filter === '') return true
  if (filter === NO_TAG) return !tagIds || tagIds.length === 0
  return (tagIds ?? []).includes(Number(filter))
}
