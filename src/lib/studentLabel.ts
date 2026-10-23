import { useEffect, useMemo, useState } from 'react'
import { brand } from './brand'
import { classroomCategoryName, sortClassCategories, useClassCategories, type ClassCategory } from './classCategories'
import { getStudentClassIds } from './roster'
import { getStudentKind } from './studentLink'
import { supabase } from './supabase'
import type { Classroom, Package, Student } from '../types/domain'

// What a student is called in the Inbox (chat list, side panel, Family card, linker) and its type filter.
// A school that groups students by class category (brand.studentTabsByClassCategory, like the Students page)
// shows the categories of the classes the student is in now ("正课", "免费课"); a student in no class, and
// every student of a school that does not, gets an identity label. The identity labels can be renamed per
// school (app_settings 'student_identity_labels'); without that row they are the English ones the CRM always had.
export type StudentIdentity = 'hoa' | 'trial' | 'regular' | 'camp' | 'preview'

export type StudentIdentityLabels = Record<StudentIdentity, string>

export const STUDENT_IDENTITY_KEYS: StudentIdentity[] = ['regular', 'trial', 'camp', 'hoa', 'preview']

// An old preview-class student was always shown as HOA, so it stays that until a school renames it.
export const defaultStudentIdentityLabels: StudentIdentityLabels = {
  hoa: 'HOA',
  trial: 'Trial',
  regular: 'Regular',
  camp: 'Camp',
  preview: 'HOA',
}

export function readStudentIdentityLabels(value: unknown): StudentIdentityLabels {
  const labels = { ...defaultStudentIdentityLabels }
  if (value && typeof value === 'object') {
    for (const key of STUDENT_IDENTITY_KEYS) {
      const text = (value as Record<string, unknown>)[key]
      if (typeof text === 'string' && text.trim() !== '') {
        labels[key] = text.trim()
      }
    }
  }
  return labels
}

export function getStudentIdentity(student: Student, packages: Package[]): StudentIdentity {
  return student.studentType === 'preview' ? 'preview' : getStudentKind(student, packages)
}

export type StudentLabelContext = {
  classrooms: Pick<Classroom, 'id' | 'category' | 'categoryName'>[]
  categories: ClassCategory[]
  packages: Package[]
  identityLabels: StudentIdentityLabels
  // Name students by their classes' categories (else always by identity).
  byCategory?: boolean
}

// The names the type filter knows the student by: their classes' categories, else their identity label.
export function studentGroups(student: Student, context: StudentLabelContext): string[] {
  if (context.byCategory ?? brand.studentTabsByClassCategory) {
    const names = new Set<string>()
    for (const id of getStudentClassIds(student)) {
      const classroom = context.classrooms.find((entry) => entry.id === id)
      if (classroom?.category) {
        names.add(classroomCategoryName(classroom, context.categories))
      }
    }
    if (names.size > 0) {
      return [...names]
    }
  }
  return [context.identityLabels[getStudentIdentity(student, context.packages)]]
}

// The labels shown for the student: the groups, with a regular student's plan after it ("Regular · 3 Months").
export function studentLabels(student: Student, context: StudentLabelContext): string[] {
  const groups = studentGroups(student, context)
  const identity = getStudentIdentity(student, context.packages)
  const plan = context.packages.find((entry) => entry.id === student.packageId)
  if (identity === 'regular' && plan && groups.length === 1 && groups[0] === context.identityLabels.regular) {
    return [`${groups[0]} · ${plan.name}`]
  }
  return groups
}

export function studentLabel(student: Student, context: StudentLabelContext) {
  return studentLabels(student, context).join(' / ')
}

// One copy of the school's identity labels for the whole page.
let cached: StudentIdentityLabels | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(next: StudentIdentityLabels) {
  cached = next
  listeners.forEach((listener) => listener())
}

export async function reloadStudentIdentityLabels() {
  if (!supabase) {
    publish(defaultStudentIdentityLabels)
    return
  }
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'student_identity_labels').maybeSingle()
    publish(readStudentIdentityLabels(data?.value))
  } catch {
    // No row, no network: the English ones.
    publish(defaultStudentIdentityLabels)
  }
}

export function useStudentIdentityLabels() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const listener = () => rerender((count) => count + 1)
    listeners.add(listener)
    if (cached === null && loading === null) {
      loading = reloadStudentIdentityLabels().finally(() => {
        loading = null
      })
    }
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return cached ?? defaultStudentIdentityLabels
}

// Everything studentLabels needs, from the school's class categories and identity labels.
export function useStudentLabelContext(classrooms: StudentLabelContext['classrooms'], packages: Package[]): StudentLabelContext {
  const { categories } = useClassCategories()
  const identityLabels = useStudentIdentityLabels()
  return useMemo(() => ({ classrooms, categories, packages, identityLabels }), [classrooms, categories, packages, identityLabels])
}

// Tests: set the labels by hand (null: read them again on next use).
export function resetStudentIdentityLabelsForTests(labels: StudentIdentityLabels | null = null) {
  cached = labels
  loading = null
  listeners.forEach((listener) => listener())
}

// The type filter's choices: the school's shown categories (and a hidden one a student still has), then the
// identity labels, without repeats.
export function studentGroupOptions(categories: ClassCategory[], used: Iterable<string>, identityLabels: StudentIdentityLabels, byCategory = brand.studentTabsByClassCategory) {
  const usedSet = new Set(used)
  const options: string[] = []
  const add = (name: string) => {
    if (!options.includes(name)) options.push(name)
  }
  if (byCategory) {
    for (const category of sortClassCategories(categories)) {
      if (category.isActive || usedSet.has(category.name)) add(category.name)
    }
  }
  for (const key of STUDENT_IDENTITY_KEYS) {
    const label = identityLabels[key]
    // A school grouping by category lists only the identity labels some student has (a student in no class);
    // the others always have the four, and the old preview-class label only while a student still carries it.
    if (usedSet.has(label) || (!byCategory && key !== 'preview')) add(label)
  }
  return options
}
