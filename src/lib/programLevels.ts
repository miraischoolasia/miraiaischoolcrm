import { createContext, useContext } from 'react'
import { supabase } from './supabase'
import { programLevelOptions } from './constants'
import type { AgeGroupOption } from './ageGroups'

// A class level the school uses (Coder Foundation, Form 4, ...): the same shape
// as an age group, kept in Class Settings > Class options.
export type ProgramLevelOption = AgeGroupOption

export const defaultProgramLevels: ProgramLevelOption[] = programLevelOptions.map((name, index) => ({
  name,
  sortOrder: (index + 1) * 10,
  isActive: true,
}))

// The school's level names, given once by App; the default list until they
// load (or when Supabase is not configured).
export const ProgramLevelsContext = createContext<string[]>(programLevelOptions)

export function useProgramLevels() {
  return useContext(ProgramLevelsContext)
}

export async function fetchProgramLevels(): Promise<ProgramLevelOption[]> {
  if (!supabase) return defaultProgramLevels
  const { data, error } = await supabase.from('program_levels').select('*').order('sort_order').order('name')
  if (error) throw error
  return data.map((row) => ({ name: row.name, sortOrder: row.sort_order, isActive: row.is_active }))
}

// Adds (current null) or changes one; resolves to an error message, or null.
export async function saveProgramLevel(current: ProgramLevelOption | null, changes: Partial<ProgramLevelOption>) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_program_level', {
    p_name: current?.name ?? null,
    p_new_name: changes.name ?? current?.name ?? '',
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  return error ? error.message || 'Failed to save the class level.' : null
}
