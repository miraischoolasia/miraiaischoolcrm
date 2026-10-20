import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'
import type { Teacher } from '../types/domain'

// Four more things a school may keep on a student (20261027400000_student_profile_extras.sql):
// the Chinese name, the kind of student (the school's own list, e.g. 新生 / 续报 / 回流生),
// the consultant (a staff member who looks after the family) and a second parent's phone.
// Each school picks which it shows (Class Settings > Student fields); all off unless switched
// on, as at Mirai. Before the migration is pushed nothing here is read, and the page loads as before.

export type StudentFieldKey = 'name_zh' | 'student_kind' | 'consultant' | 'second_parent_phone'
export type StudentFieldsSetting = Record<StudentFieldKey, boolean>

export const STUDENT_FIELD_KEYS: StudentFieldKey[] = ['name_zh', 'student_kind', 'consultant', 'second_parent_phone']
export const STUDENT_FIELD_LABELS: Record<StudentFieldKey, string> = {
  name_zh: 'Chinese name',
  student_kind: 'Kind of student',
  consultant: 'Consultant',
  second_parent_phone: 'Second parent phone',
}
export const NO_STUDENT_FIELDS: StudentFieldsSetting = { name_zh: false, student_kind: false, consultant: false, second_parent_phone: false }

export function anyStudentField(setting: StudentFieldsSetting) {
  return STUDENT_FIELD_KEYS.some((key) => setting[key])
}

export function readStudentFieldsSetting(value: unknown): StudentFieldsSetting {
  const raw = (value ?? {}) as Partial<Record<StudentFieldKey, unknown>>
  return {
    name_zh: raw.name_zh === true,
    student_kind: raw.student_kind === true,
    consultant: raw.consultant === true,
    second_parent_phone: raw.second_parent_phone === true,
  }
}

export async function fetchStudentFields(): Promise<StudentFieldsSetting> {
  if (!supabase) return NO_STUDENT_FIELDS
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'student_fields').maybeSingle()
    if (error || !data) return NO_STUDENT_FIELDS
    return readStudentFieldsSetting(data.value)
  } catch {
    return NO_STUDENT_FIELDS
  }
}

// Null when saved, else the reason.
export async function setStudentFields(setting: StudentFieldsSetting) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_student_fields', { p_value: setting })
  if (!error) return null
  return isMissingDatabaseThing(error)
    ? "Student fields can't be switched on until the database update for them is applied."
    : error.message || 'Could not change the student fields.'
}

// ---------------------------------------------------------------------------
// Kinds of student (the school's own list)

export type StudentKind = { name: string; sortOrder: number; isActive: boolean }

export function sortStudentKinds(kinds: StudentKind[]) {
  return [...kinds].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

// Every kind, hidden ones too (a student may still have one). Empty before the database update.
export async function fetchStudentKinds(): Promise<StudentKind[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase.from('student_kinds').select('name, sort_order, is_active')
    if (error) return []
    return sortStudentKinds((data ?? []).map((row) => ({ name: row.name, sortOrder: row.sort_order, isActive: row.is_active })))
  } catch {
    return []
  }
}

// Adds (current null) or changes one. Null when saved, else the reason.
export async function saveStudentKind(current: StudentKind | null, changes: Partial<StudentKind>) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_student_kind', {
    p_name: current?.name ?? null,
    p_new_name: changes.name ?? current?.name ?? null,
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  return error ? error.message || 'Could not save the kind of student.' : null
}

// ---------------------------------------------------------------------------
// The four values on each student

export type StudentProfileExtras = {
  nameZh: string | null
  kind: string | null
  consultantId: number | null
  secondParentPhone: string | null
}

const STUDENT_PAGE_SIZE = 1000

// Every student that has any of the four, read only when the school shows at least one.
export async function fetchStudentProfileExtras(): Promise<Map<number, StudentProfileExtras>> {
  const extras = new Map<number, StudentProfileExtras>()
  if (!supabase) return extras
  try {
    for (let from = 0; ; from += STUDENT_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('students')
        .select('id, name_zh, student_kind, consultant_id, second_parent_phone')
        .or('name_zh.not.is.null,student_kind.not.is.null,consultant_id.not.is.null,second_parent_phone.not.is.null')
        .order('id')
        .range(from, from + STUDENT_PAGE_SIZE - 1)
      if (error) return extras
      for (const row of data ?? []) {
        extras.set(row.id, {
          nameZh: row.name_zh,
          kind: row.student_kind,
          consultantId: row.consultant_id,
          secondParentPhone: row.second_parent_phone,
        })
      }
      if ((data ?? []).length < STUDENT_PAGE_SIZE) return extras
    }
  } catch {
    return extras
  }
}

// The form's text for them ('' when not set).
export type StudentExtrasForm = { nameZh: string; studentKind: string; consultantId: string; secondParentPhone: string }

export const EMPTY_STUDENT_EXTRAS_FORM: StudentExtrasForm = { nameZh: '', studentKind: '', consultantId: '', secondParentPhone: '' }

export function extrasToForm(extras: StudentProfileExtras | undefined): StudentExtrasForm {
  return {
    nameZh: extras?.nameZh ?? '',
    studentKind: extras?.kind ?? '',
    consultantId: extras?.consultantId ? String(extras.consultantId) : '',
    secondParentPhone: extras?.secondParentPhone ?? '',
  }
}

type ExtrasRow = { name_zh?: string | null; student_kind?: string | null; consultant_id?: number | null; second_parent_phone?: string | null }

// What changed among the fields the school shows (null when nothing did). Throws with a reason to show.
export function extrasChanges(form: StudentExtrasForm, current: StudentProfileExtras | undefined, setting: StudentFieldsSetting): ExtrasRow | null {
  const before = extrasToForm(current)
  const changes: ExtrasRow = {}
  const nameZh = form.nameZh.trim()
  if (setting.name_zh && nameZh !== before.nameZh) {
    if (nameZh.length > 60) throw new Error('The Chinese name can be at most 60 characters.')
    changes.name_zh = nameZh || null
  }
  if (setting.student_kind && form.studentKind !== before.studentKind) {
    changes.student_kind = form.studentKind || null
  }
  if (setting.consultant && form.consultantId !== before.consultantId) {
    changes.consultant_id = form.consultantId ? Number(form.consultantId) : null
  }
  const phone = form.secondParentPhone.trim()
  if (setting.second_parent_phone && phone !== before.secondParentPhone) {
    if (phone && (phone.length < 6 || phone.length > 30)) throw new Error('The second parent phone must be 6 to 30 characters.')
    changes.second_parent_phone = phone || null
  }
  return Object.keys(changes).length > 0 ? changes : null
}

// Saves the changed fields; resolves to the student's values after it. Throws with a reason to show.
export async function saveStudentProfileExtras(
  studentId: number,
  form: StudentExtrasForm,
  current: StudentProfileExtras | undefined,
  setting: StudentFieldsSetting,
): Promise<StudentProfileExtras | undefined> {
  const changes = extrasChanges(form, current, setting)
  if (!changes || !supabase) return current
  const { error } = await supabase.from('students').update(changes).eq('id', studentId)
  if (error) {
    throw new Error(
      isMissingDatabaseThing(error)
        ? "These fields can't be saved until the database update for them is applied."
        : error.message || 'Could not save the student fields.',
    )
  }
  return {
    nameZh: 'name_zh' in changes ? (changes.name_zh ?? null) : (current?.nameZh ?? null),
    kind: 'student_kind' in changes ? (changes.student_kind ?? null) : (current?.kind ?? null),
    consultantId: 'consultant_id' in changes ? (changes.consultant_id ?? null) : (current?.consultantId ?? null),
    secondParentPhone: 'second_parent_phone' in changes ? (changes.second_parent_phone ?? null) : (current?.secondParentPhone ?? null),
  }
}

// ---------------------------------------------------------------------------
// Consultants and the student list filter

// Who may be a consultant: the school's active staff and admins (never a teacher-only login).
export function consultantOptions(teachers: Teacher[]) {
  return teachers
    .filter((teacher) => teacher.isActive && (teacher.role === 'staff' || teacher.role === 'admin'))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

// The list filters: '' is any, NOT_SET is "none given".
export const NOT_SET = '__none'
export type StudentExtrasFilter = { kind: string; consultantId: string }
export const NO_EXTRAS_FILTER: StudentExtrasFilter = { kind: '', consultantId: '' }

export function matchesExtrasFilter(extras: StudentProfileExtras | undefined, filter: StudentExtrasFilter) {
  const kind = extras?.kind ?? null
  const consultant = extras?.consultantId ?? null
  if (filter.kind === NOT_SET ? kind !== null : filter.kind !== '' && kind !== filter.kind) return false
  if (filter.consultantId === NOT_SET ? consultant !== null : filter.consultantId !== '' && String(consultant) !== filter.consultantId) return false
  return true
}
