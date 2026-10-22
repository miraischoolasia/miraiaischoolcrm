import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Classroom, ClassroomCategory } from '../types/domain'

// The school's class categories (Class Settings > Class options): the tabs of
// My Classroom. Each one works like one of the CRM's three kinds of class
// (20261026600000_class_categories.sql).
export type ClassCategory = {
  name: string
  kind: ClassroomCategory
  sortOrder: number
  isActive: boolean
}

export const classCategoryKinds: { kind: ClassroomCategory; label: string }[] = [
  { kind: 'regular', label: 'Regular class (weekly, 4 a month)' },
  { kind: 'trial', label: 'Trial class (offered every week)' },
  { kind: 'camp', label: 'Holiday camp class' },
]

// The three the CRM always had; used until the list loads, and before the migration.
export const defaultClassCategories: ClassCategory[] = [
  { name: 'Regular Class', kind: 'regular', sortOrder: 10, isActive: true },
  { name: 'Trial Class', kind: 'trial', sortOrder: 20, isActive: true },
  { name: 'Camp Class', kind: 'camp', sortOrder: 30, isActive: true },
]

export function sortClassCategories(list: ClassCategory[]) {
  return [...list].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
}

// A class's category name: the one an admin gave it, else its kind's first category
// (also while the page still holds a name that was just renamed).
export function classroomCategoryName(classroom: Pick<Classroom, 'category' | 'categoryName'>, list: ClassCategory[]) {
  if (classroom.categoryName && list.some((category) => category.name === classroom.categoryName)) {
    return classroom.categoryName
  }
  const sorted = sortClassCategories(list)
  return (
    sorted.find((category) => category.kind === classroom.category && category.isActive) ??
    sorted.find((category) => category.kind === classroom.category) ??
    defaultClassCategories.find((category) => category.kind === classroom.category)
  )!.name
}

// The tabs of My Classroom: every shown category, plus a hidden one a class still uses.
export function classCategoryTabs(list: ClassCategory[], classrooms: Pick<Classroom, 'category' | 'categoryName'>[]) {
  const used = new Set(classrooms.map((classroom) => classroomCategoryName(classroom, list)))
  return sortClassCategories(list).filter((category) => category.isActive || used.has(category.name))
}

// The categories a class can be put in: the shown ones, plus its own if hidden now.
export function classCategoryOptions(list: ClassCategory[], current: string | undefined) {
  return sortClassCategories(list).filter((category) => category.isActive || category.name === current)
}

// One copy of the list for the whole page, so a change in Class Settings shows everywhere at once.
let cached: ClassCategory[] | null = null
// False before the migration (or without Supabase): the defaults stand in and nothing is saved.
let fromDatabase = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(next: ClassCategory[], saved: boolean) {
  cached = next
  fromDatabase = saved
  listeners.forEach((listener) => listener())
}

export async function reloadClassCategories() {
  if (!supabase) {
    publish(defaultClassCategories, false)
    return
  }
  let result
  try {
    result = await supabase.from('class_categories').select('name, kind, sort_order, is_active')
  } catch {
    // The network (or a page that has no database) must never leave an unhandled error behind.
    publish(defaultClassCategories, false)
    return
  }
  const { data, error } = result
  if (error) {
    // Before the migration the table is not there.
    publish(defaultClassCategories, false)
    return
  }
  publish(
    (data ?? []).map((row) => ({ name: row.name, kind: row.kind, sortOrder: row.sort_order, isActive: row.is_active })),
    true,
  )
}

export function useClassCategories() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const listener = () => rerender((count) => count + 1)
    listeners.add(listener)
    if (cached === null && loading === null) {
      loading = reloadClassCategories().finally(() => {
        loading = null
      })
    }
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return { categories: cached ?? defaultClassCategories, fromDatabase }
}

// Adds (current null) or changes one; resolves to an error message, or null.
export async function saveClassCategory(current: ClassCategory | null, changes: Partial<ClassCategory>) {
  if (!supabase) return 'Supabase is not configured.'
  if (!fromDatabase) return 'Class categories need the database update first.'
  const { error } = await supabase.rpc('save_class_category', {
    p_name: current?.name ?? null,
    p_new_name: changes.name ?? current?.name ?? null,
    p_kind: changes.kind ?? null,
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  if (error) return error.message || 'Failed to save the class category.'
  await reloadClassCategories()
  return null
}

// Tests and the dev demo: set the list by hand (null: read it again on next use).
export function resetClassCategoriesForTests(list: ClassCategory[] | null = null, saved = false) {
  cached = list
  fromDatabase = saved
  loading = null
  listeners.forEach((listener) => listener())
}
