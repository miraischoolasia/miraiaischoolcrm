import { createContext, useContext } from 'react'
import { supabase } from './supabase'
import { ageGroupOptions } from './constants'

// An age group the school sorts its classes by (each school keeps its own
// list in Class Settings > Subjects & ages).
export type AgeGroupOption = {
  name: string
  sortOrder: number
  isActive: boolean
}

export const defaultAgeGroups: AgeGroupOption[] = ageGroupOptions.map((name, index) => ({
  name,
  sortOrder: (index + 1) * 10,
  isActive: true,
}))

// The names to offer, in the school's order: the shown ones, plus any a class
// still uses (so no class ever drops out of a list).
export function ageGroupNames(groups: AgeGroupOption[], inUse: string[] = []) {
  const used = new Set(inUse)
  const names = [...groups]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    .filter((group) => group.isActive || used.has(group.name))
    .map((group) => group.name)
  for (const name of used) {
    if (!names.includes(name)) names.push(name)
  }
  return names
}

// "9-11 Years Old" -> "9-11" for small labels.
export function shortAgeGroup(name: string) {
  return name.replace(/\s+years?\s+old$/i, '')
}

// The school's age group names, given once by App; the default list until
// they load (or when Supabase is not configured).
export const AgeGroupsContext = createContext<string[]>(ageGroupOptions)

export function useAgeGroups() {
  return useContext(AgeGroupsContext)
}

export async function fetchAgeGroups(): Promise<AgeGroupOption[]> {
  if (!supabase) return defaultAgeGroups
  const { data, error } = await supabase.from('age_groups').select('*').order('sort_order').order('name')
  if (error) throw error
  return data.map((row) => ({ name: row.name, sortOrder: row.sort_order, isActive: row.is_active }))
}

// Adds (current null) or changes one; resolves to an error message, or null.
export async function saveAgeGroup(
  current: AgeGroupOption | null,
  changes: Partial<AgeGroupOption>,
) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_age_group', {
    p_name: current?.name ?? null,
    p_new_name: changes.name ?? current?.name ?? '',
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  return error ? error.message || 'Failed to save the age group.' : null
}
