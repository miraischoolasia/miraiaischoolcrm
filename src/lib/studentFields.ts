import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'
import type { Teacher } from '../types/domain'

// More things a school may keep on a student. Four of them (20261027400000_student_profile_extras.sql): the Chinese
// name, the kind of student (the school's own list, e.g. 新生 / 续报 / 回流生), the consultant (a staff member who looks
// after the family) and a second parent's phone. Eight more for the roster table (20261030100000_student_roster_fields.sql):
// the sales person, the membership level, the Facebook name, West / East Malaysia, how they enrol, how they pay, the
// hero membership and the fee month. Each school picks which it shows (Class Settings > Student fields); all off unless
// switched on, as at Mirai. Before the migrations are pushed nothing here is read, and the page loads as before.

export type StudentFieldKey =
  | 'name_zh'
  | 'student_kind'
  | 'consultant'
  | 'second_parent_phone'
  | 'sales_person'
  | 'membership'
  | 'fb_name'
  | 'region'
  | 'enrol_method'
  | 'payment_mode'
  | 'hero_member'
  | 'fee_month'
  // Not a field: the roster table (the columns of the school's master list) on the Students page.
  | 'roster_table'
export type StudentFieldsSetting = Record<StudentFieldKey, boolean>

export const STUDENT_FIELD_KEYS: StudentFieldKey[] = [
  'name_zh',
  'student_kind',
  'consultant',
  'second_parent_phone',
  'sales_person',
  'membership',
  'fb_name',
  'region',
  'enrol_method',
  'payment_mode',
  'hero_member',
  'fee_month',
  'roster_table',
]
export const STUDENT_FIELD_LABELS: Record<StudentFieldKey, string> = {
  name_zh: 'Chinese name',
  student_kind: 'Kind of student',
  consultant: 'Consultant (Learning Consultant)',
  second_parent_phone: 'Second parent phone',
  sales_person: 'Sales person (Education Consultant)',
  membership: 'Membership',
  fb_name: 'Facebook name',
  region: 'West / East Malaysia',
  enrol_method: 'How they enrol',
  payment_mode: 'Pay once or by instalments',
  hero_member: 'Hero membership',
  fee_month: 'Fee payment month',
  roster_table: 'Roster table on the Students page',
}
export const NO_STUDENT_FIELDS: StudentFieldsSetting = {
  name_zh: false,
  student_kind: false,
  consultant: false,
  second_parent_phone: false,
  sales_person: false,
  membership: false,
  fb_name: false,
  region: false,
  enrol_method: false,
  payment_mode: false,
  hero_member: false,
  fee_month: false,
  roster_table: false,
}

export function anyStudentField(setting: StudentFieldsSetting) {
  return STUDENT_FIELD_KEYS.some((key) => setting[key])
}

export function readStudentFieldsSetting(value: unknown): StudentFieldsSetting {
  const raw = (value ?? {}) as Partial<Record<StudentFieldKey, unknown>>
  const setting = { ...NO_STUDENT_FIELDS }
  for (const key of STUDENT_FIELD_KEYS) {
    setting[key] = raw[key] === true
  }
  return setting
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
// The values on each student

export type StudentProfileExtras = {
  nameZh: string | null
  kind: string | null
  consultantId: number | null
  secondParentPhone: string | null
  // The roster fields; absent (as in older data) means not set.
  salesPersonId?: number | null
  membership?: string | null
  fbName?: string | null
  region?: string | null
  enrolMethod?: string | null
  paymentMode?: string | null
  heroMember?: string | null
  feeMonth?: number | null
}

const ROSTER_COLUMNS = 'sales_person_id, membership, fb_name, region, enrol_method, payment_mode, hero_member, fee_month'
const ANY_VALUE_FILTER =
  'name_zh.not.is.null,student_kind.not.is.null,consultant_id.not.is.null,second_parent_phone.not.is.null,' +
  'sales_person_id.not.is.null,membership.not.is.null,fb_name.not.is.null,region.not.is.null,enrol_method.not.is.null,' +
  'payment_mode.not.is.null,hero_member.not.is.null,fee_month.not.is.null'

const STUDENT_PAGE_SIZE = 1000

// Every student that has any of the values, read only when the school shows at least one field.
export async function fetchStudentProfileExtras(): Promise<Map<number, StudentProfileExtras>> {
  const extras = new Map<number, StudentProfileExtras>()
  if (!supabase) return extras
  try {
    for (let from = 0; ; from += STUDENT_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('students')
        .select(`id, name_zh, student_kind, consultant_id, second_parent_phone, ${ROSTER_COLUMNS}`)
        .or(ANY_VALUE_FILTER)
        .order('id')
        .range(from, from + STUDENT_PAGE_SIZE - 1)
      if (error) return extras
      for (const row of data ?? []) {
        extras.set(row.id, {
          nameZh: row.name_zh,
          kind: row.student_kind,
          consultantId: row.consultant_id,
          secondParentPhone: row.second_parent_phone,
          salesPersonId: row.sales_person_id,
          membership: row.membership,
          fbName: row.fb_name,
          region: row.region,
          enrolMethod: row.enrol_method,
          paymentMode: row.payment_mode,
          heroMember: row.hero_member,
          feeMonth: row.fee_month,
        })
      }
      if ((data ?? []).length < STUDENT_PAGE_SIZE) return extras
    }
  } catch {
    return extras
  }
}

// The form's text for them ('' when not set).
export type StudentExtrasForm = {
  nameZh: string
  studentKind: string
  consultantId: string
  secondParentPhone: string
  salesPersonId?: string
  membership?: string
  fbName?: string
  region?: string
  enrolMethod?: string
  paymentMode?: string
  heroMember?: string
  feeMonth?: string
}

export const EMPTY_STUDENT_EXTRAS_FORM: StudentExtrasForm = {
  nameZh: '',
  studentKind: '',
  consultantId: '',
  secondParentPhone: '',
  salesPersonId: '',
  membership: '',
  fbName: '',
  region: '',
  enrolMethod: '',
  paymentMode: '',
  heroMember: '',
  feeMonth: '',
}

export function extrasToForm(extras: StudentProfileExtras | undefined): StudentExtrasForm {
  return {
    nameZh: extras?.nameZh ?? '',
    studentKind: extras?.kind ?? '',
    consultantId: extras?.consultantId ? String(extras.consultantId) : '',
    secondParentPhone: extras?.secondParentPhone ?? '',
    salesPersonId: extras?.salesPersonId ? String(extras.salesPersonId) : '',
    membership: extras?.membership ?? '',
    fbName: extras?.fbName ?? '',
    region: extras?.region ?? '',
    enrolMethod: extras?.enrolMethod ?? '',
    paymentMode: extras?.paymentMode ?? '',
    heroMember: extras?.heroMember ?? '',
    feeMonth: extras?.feeMonth ? String(extras.feeMonth) : '',
  }
}

type ExtrasRow = {
  name_zh?: string | null
  student_kind?: string | null
  consultant_id?: number | null
  second_parent_phone?: string | null
  sales_person_id?: number | null
  membership?: string | null
  fb_name?: string | null
  region?: string | null
  enrol_method?: string | null
  payment_mode?: string | null
  hero_member?: string | null
  fee_month?: number | null
}

// The roster fields that are a choice from the school's list: form key, column, setting key.
const LIST_FIELDS = [
  ['membership', 'membership', 'membership'],
  ['region', 'region', 'region'],
  ['enrolMethod', 'enrol_method', 'enrol_method'],
  ['paymentMode', 'payment_mode', 'payment_mode'],
  ['heroMember', 'hero_member', 'hero_member'],
] as const

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
  if (setting.sales_person && (form.salesPersonId ?? '') !== (before.salesPersonId ?? '')) {
    changes.sales_person_id = form.salesPersonId ? Number(form.salesPersonId) : null
  }
  const fbName = (form.fbName ?? '').trim()
  if (setting.fb_name && fbName !== (before.fbName ?? '')) {
    if (fbName.length > 80) throw new Error('The Facebook name can be at most 80 characters.')
    changes.fb_name = fbName || null
  }
  for (const [formKey, column, settingKey] of LIST_FIELDS) {
    if (setting[settingKey] && (form[formKey] ?? '') !== (before[formKey] ?? '')) {
      changes[column] = form[formKey] || null
    }
  }
  if (setting.fee_month && (form.feeMonth ?? '') !== (before.feeMonth ?? '')) {
    changes.fee_month = form.feeMonth ? Number(form.feeMonth) : null
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
    salesPersonId: 'sales_person_id' in changes ? (changes.sales_person_id ?? null) : (current?.salesPersonId ?? null),
    membership: 'membership' in changes ? (changes.membership ?? null) : (current?.membership ?? null),
    fbName: 'fb_name' in changes ? (changes.fb_name ?? null) : (current?.fbName ?? null),
    region: 'region' in changes ? (changes.region ?? null) : (current?.region ?? null),
    enrolMethod: 'enrol_method' in changes ? (changes.enrol_method ?? null) : (current?.enrolMethod ?? null),
    paymentMode: 'payment_mode' in changes ? (changes.payment_mode ?? null) : (current?.paymentMode ?? null),
    heroMember: 'hero_member' in changes ? (changes.hero_member ?? null) : (current?.heroMember ?? null),
    feeMonth: 'fee_month' in changes ? (changes.fee_month ?? null) : (current?.feeMonth ?? null),
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

// Who can be named as the Sales person: staff and admins, and teachers too (a parent may come straight to a teacher, who then
// is the one who closed the sale). The Learning Consultant list above stays staff and admins only.
export function salesPersonOptions(teachers: Teacher[]) {
  return teachers
    .filter((teacher) => teacher.isActive && (teacher.role === 'staff' || teacher.role === 'admin' || teacher.role === 'teacher'))
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
