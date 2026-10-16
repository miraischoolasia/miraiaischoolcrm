import { supabase } from './supabase'

// A subject the school teaches (Coding, AI, Maths, ...). Questions and classes
// carry one, so a class finds the questions that fit it.
export type Subject = {
  id: number
  name: string
  sortOrder: number
  isActive: boolean
}

export async function fetchSubjects(): Promise<Subject[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('subjects').select('*').order('sort_order').order('id')
  if (error) throw error
  return data.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order, isActive: row.is_active }))
}

// Adds (subject null) or changes one; resolves to an error message, or null.
export async function saveSubject(
  subject: Subject | null,
  changes: Partial<Pick<Subject, 'name' | 'sortOrder' | 'isActive'>>,
) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_subject', {
    p_id: subject?.id ?? null,
    p_name: changes.name ?? subject?.name ?? '',
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  if (!error) return null
  return error.code === '23505' ? `"${changes.name}" is already a subject.` : error.message || 'Failed to save the subject.'
}
