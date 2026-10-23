import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'
import { classroomCategoryName, type ClassCategory } from './classCategories'
import { getStudentClassIds } from './roster'
import type { Classroom, Student } from '../types/domain'

// The roster table (20261030100000_student_roster_fields.sql): the columns of the school's master list on the Students
// page. The five fields that are a choice from the school's own list, how subjects are counted, and the three numbers
// the page works out from the class history.

export type RosterListField = 'membership' | 'region' | 'enrol_method' | 'payment_mode' | 'hero_member'

export const ROSTER_LIST_FIELDS: { field: RosterListField; label: string; formKey: 'membership' | 'region' | 'enrolMethod' | 'paymentMode' | 'heroMember' }[] = [
  { field: 'membership', label: 'Membership', formKey: 'membership' },
  { field: 'region', label: 'West / East Malaysia', formKey: 'region' },
  { field: 'enrol_method', label: 'How they enrol', formKey: 'enrolMethod' },
  { field: 'payment_mode', label: 'Pay once or by instalments', formKey: 'paymentMode' },
  { field: 'hero_member', label: 'Hero membership', formKey: 'heroMember' },
]

export type FieldOption = { field: RosterListField; name: string; sortOrder: number; isActive: boolean }

export function sortFieldOptions<T extends { name: string; sortOrder: number; isActive: boolean }>(options: T[]) {
  return [...options].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

// Every choice of every list, hidden ones too (a student may still have one). Empty before the database update.
export async function fetchFieldOptions(): Promise<FieldOption[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.from('student_field_options').select('field, name, sort_order, is_active')
    if (error) return []
    return (data ?? []).map((row) => ({ field: row.field as RosterListField, name: row.name, sortOrder: row.sort_order, isActive: row.is_active }))
  } catch {
    return []
  }
}

// Adds (current null) or changes one choice. Null when saved, else the reason.
export async function saveFieldOption(field: RosterListField, current: FieldOption | null, changes: Partial<FieldOption>) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_student_field_option', {
    p_field: field,
    p_name: current?.name ?? null,
    p_new_name: changes.name ?? current?.name ?? null,
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  if (!error) return null
  return isMissingDatabaseThing(error) ? "These choices can't be changed until the database update for them is applied." : error.message || 'Could not save the choice.'
}

// How subjects are counted. No categories ticked: every class category that works like a regular class.
// changesFrom null: 1 January of this year.
export type RosterCounts = { countCategories: string[]; changesFrom: string | null }
export const DEFAULT_ROSTER_COUNTS: RosterCounts = { countCategories: [], changesFrom: null }

export function readRosterCounts(value: unknown): RosterCounts {
  const raw = (value ?? {}) as { count_categories?: unknown; changes_from?: unknown }
  return {
    countCategories: Array.isArray(raw.count_categories) ? raw.count_categories.filter((name): name is string => typeof name === 'string') : [],
    changesFrom: typeof raw.changes_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.changes_from) ? raw.changes_from : null,
  }
}

export async function fetchRosterCounts(): Promise<RosterCounts> {
  if (!supabase) return DEFAULT_ROSTER_COUNTS
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'student_roster').maybeSingle()
    if (error || !data) return DEFAULT_ROSTER_COUNTS
    return readRosterCounts(data.value)
  } catch {
    return DEFAULT_ROSTER_COUNTS
  }
}

// Null when saved, else the reason.
export async function saveRosterCounts(counts: RosterCounts) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_student_roster_counts', { p_categories: counts.countCategories, p_changes_from: counts.changesFrom })
  if (!error) return null
  return isMissingDatabaseThing(error) ? "This can't be saved until the database update for it is applied." : error.message || 'Could not save how subjects are counted.'
}

// Whether a class counts as a subject of the student: its category is one of the ticked ones, or (none ticked) works
// like a regular class.
export function classCounts(classroom: Pick<Classroom, 'category' | 'categoryName'>, categories: ClassCategory[], counts: RosterCounts) {
  const name = classroomCategoryName(classroom, categories)
  if (counts.countCategories.length > 0) return counts.countCategories.includes(name)
  return categories.find((category) => category.name === name)?.kind === 'regular'
}

export type SubjectCounts = { subjects: number; stopped: number; added: number }

// Number of subjects: the subjects of the counted classes the student is in now (two classes of one subject are one).
// Stopped / added: the stays in a counted class that ended / began from `changesFrom` (1 January of this year when not
// given) up to today. Moving from one class to another is one stopped and one added.
export function subjectCounts(
  student: Pick<Student, 'classroomId' | 'classPeriods'>,
  classrooms: Map<number, Classroom>,
  categories: ClassCategory[],
  counts: RosterCounts,
  today: string,
): SubjectCounts {
  const from = counts.changesFrom ?? `${today.slice(0, 4)}-01-01`
  const counted = (classroomId: number) => {
    const classroom = classrooms.get(classroomId)
    return classroom !== undefined && classCounts(classroom, categories, counts) ? classroom : null
  }
  const subjects = new Set<string>()
  for (const id of getStudentClassIds(student as Student)) {
    const classroom = counted(id)
    if (classroom) subjects.add(classroom.subjectId != null ? `subject:${classroom.subjectId}` : `class:${classroom.id}`)
  }
  let stopped = 0
  let added = 0
  for (const period of student.classPeriods ?? []) {
    if (!counted(period.classroomId)) continue
    if (period.endDate !== null && period.endDate >= from && period.endDate <= today) stopped += 1
    if (period.startDate !== null && period.startDate >= from && period.startDate <= today) added += 1
  }
  return { subjects: subjects.size, stopped, added }
}
