import { supabase } from './supabase'

// The Today page by role (migration 20261102600000_today_by_role.sql). The database works the figures out for the signed-in
// person (an admin may ask for someone else's); these are the shapes it returns and the reading of them. Everything that
// can be missing is optional: a school whose database is older than this migration just shows no extra cards.

export type TodayView = 'admin' | 'teacher' | 'ec' | 'lc'

export type TodayRoles = { teacherId: number; ec: boolean; lc: boolean }

export type EcQuotation = {
  reference: string
  childName: string
  total: number
  status: string
  leadId: number | null
  sentOn: string
  parentSaidWrong: boolean
}

export type EcTrial = { leadId: number | null; childName: string; startTime: string; className: string | null }

export type TodayEc = {
  available: boolean
  leadsOpen: number
  leadsNewToday: number
  leadsMonth: number
  convertedMonth: number
  revenueMonth: number
  quotations: EcQuotation[]
  trialsToday: EcTrial[]
}

export type LcStudentRef = { studentId: number; name: string }
export type LcRisk = LcStudentRef & { why: string; lessonDate: string | null }
export type LcExpiring = LcStudentRef & { endsOn: string | null; lessonsLeft: number | null }
export type LcAbsent = LcStudentRef & { status: string }

export type TodayLc = {
  available: boolean
  students: number
  staysAdded: number
  staysStopped: number
  atRisk: LcRisk[]
  expiring: LcExpiring[]
  absentToday: LcAbsent[]
  birthdays: LcStudentRef[]
  cardsDue: number
  cardsSent: number
}

export type TeacherWatch = LcStudentRef & { why: string; lessonDate: string | null; className: string | null }

export type TodayTeacher = { watch: TeacherWatch[] }

export type TeamPerson = {
  teacherId: number
  name: string
  role: string
  isEc: boolean
  isLc: boolean
  overdueFollowups: number
  convertedMonth: number
  students: number
  atRisk: number
  lessonsToday: number
  notTaken: number
}

export type TeamApproval = {
  reference: string
  childName: string
  total: number
  discountAmount: number
  leadId: number | null
  salesPersonId: number | null
}

export type TodayTeam = { people: TeamPerson[]; approvals: TeamApproval[] }

type Raw = Record<string, unknown>

const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {})
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.map(obj) : [])
const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)
const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null)
const numOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function readTodayRoles(value: unknown): TodayRoles | null {
  const raw = obj(value)
  const teacherId = numOrNull(raw.teacher_id)
  return teacherId === null ? null : { teacherId, ec: raw.ec === true, lc: raw.lc === true }
}

export function readTodayEc(value: unknown): TodayEc {
  const raw = obj(value)
  return {
    available: raw.available === true,
    leadsOpen: num(raw.leads_open),
    leadsNewToday: num(raw.leads_new_today),
    leadsMonth: num(raw.leads_month),
    convertedMonth: num(raw.converted_month),
    revenueMonth: num(raw.revenue_month),
    quotations: list(raw.quotations).map((row) => ({
      reference: text(row.reference),
      childName: text(row.child_name),
      total: num(row.total),
      status: text(row.status),
      leadId: numOrNull(row.lead_id),
      sentOn: text(row.sent_on),
      parentSaidWrong: row.parent_said_wrong === true,
    })),
    trialsToday: list(raw.trials_today).map((row) => ({
      leadId: numOrNull(row.lead_id),
      childName: text(row.child_name),
      startTime: text(row.start_time).slice(0, 5),
      className: textOrNull(row.class_name),
    })),
  }
}

const studentRef = (row: Raw): LcStudentRef => ({ studentId: num(row.student_id), name: text(row.name) })

export function readTodayLc(value: unknown): TodayLc {
  const raw = obj(value)
  return {
    available: raw.available === true,
    students: num(raw.students),
    staysAdded: num(raw.stays_added),
    staysStopped: num(raw.stays_stopped),
    atRisk: list(raw.at_risk).map((row) => ({ ...studentRef(row), why: text(row.why), lessonDate: textOrNull(row.lesson_date) })),
    expiring: list(raw.expiring).map((row) => ({ ...studentRef(row), endsOn: textOrNull(row.ends_on), lessonsLeft: numOrNull(row.lessons_left) })),
    absentToday: list(raw.absent_today).map((row) => ({ ...studentRef(row), status: text(row.status) })),
    birthdays: list(raw.birthdays).map(studentRef),
    cardsDue: num(raw.cards_due),
    cardsSent: num(raw.cards_sent),
  }
}

export function readTodayTeacher(value: unknown): TodayTeacher {
  return {
    watch: list(obj(value).watch).map((row) => ({
      ...studentRef(row),
      why: text(row.why),
      lessonDate: textOrNull(row.lesson_date),
      className: textOrNull(row.class_name),
    })),
  }
}

export function readTodayTeam(value: unknown): TodayTeam {
  const raw = obj(value)
  return {
    people: list(raw.people).map((row) => ({
      teacherId: num(row.teacher_id),
      name: text(row.name),
      role: text(row.role),
      isEc: row.is_ec === true,
      isLc: row.is_lc === true,
      overdueFollowups: num(row.overdue_followups),
      convertedMonth: num(row.converted_month),
      students: num(row.students),
      atRisk: num(row.at_risk),
      lessonsToday: num(row.lessons_today),
      notTaken: num(row.not_taken),
    })),
    approvals: list(raw.approvals).map((row) => ({
      reference: text(row.reference),
      childName: text(row.child_name),
      total: num(row.total),
      discountAmount: num(row.discount_amount),
      leadId: numOrNull(row.lead_id),
      salesPersonId: numOrNull(row.sales_person_id),
    })),
  }
}

// Each fetch gives null when the function is not there yet (an older database) or the call fails: the card is then simply
// not drawn.
export async function fetchTodayRoles(personId: number | null): Promise<TodayRoles | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('today_roles', { p_teacher_id: personId })
  return error ? null : readTodayRoles(data)
}

export async function fetchTodayEc(personId: number | null): Promise<TodayEc | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('today_ec', { p_teacher_id: personId })
  return error ? null : readTodayEc(data)
}

export async function fetchTodayLc(personId: number | null): Promise<TodayLc | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('today_lc', { p_teacher_id: personId })
  return error ? null : readTodayLc(data)
}

export async function fetchTodayTeacher(personId: number | null): Promise<TodayTeacher | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('today_teacher', { p_teacher_id: personId })
  return error ? null : readTodayTeacher(data)
}

export async function fetchTodayTeam(): Promise<TodayTeam | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('today_team')
  return error ? null : readTodayTeam(data)
}

// ---------------------------------------------------------------------------------------------------------------------
// Which versions of Today a person gets.
// ---------------------------------------------------------------------------------------------------------------------

export type ViewInput = {
  isAdmin: boolean
  isTeacherAccount: boolean
  roles: TodayRoles | null
}

// Admin: the admin version (and EC / LC only if they work as one themselves). A teacher: the teacher version, plus EC /
// LC when they also have those jobs. Anyone else (staff): the EC and LC versions they have; with neither, the general
// version (the one that shows only what their ticks allow).
export function todayViews({ isAdmin, isTeacherAccount, roles }: ViewInput): TodayView[] {
  const views: TodayView[] = []
  if (isTeacherAccount) {
    views.push('teacher')
  }
  if (roles?.ec) views.push('ec')
  if (roles?.lc) views.push('lc')
  if (isAdmin) {
    views.unshift('admin')
  } else if (!isTeacherAccount && views.length === 0) {
    views.push('admin')
  }
  return views
}

const REMEMBER_KEY = 'today-view'

// The version shown first: the one they used last, if they still have it, else the first.
export function pickView(views: TodayView[], remembered: string | null): TodayView | null {
  if (remembered !== null && (views as string[]).includes(remembered)) {
    return remembered as TodayView
  }
  return views[0] ?? null
}

export function readRememberedView(): string | null {
  try {
    return window.localStorage.getItem(REMEMBER_KEY)
  } catch {
    return null
  }
}

export function rememberView(view: TodayView) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, view)
  } catch {
    // Nothing remembered; they see the first one next time.
  }
}
