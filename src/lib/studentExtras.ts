import { supabase } from './supabase'

// Two things a school like EduHero keeps on a student
// (20261026400000_student_code_and_month_plans.sql):
// - the student code, the school's own number for the child, shown when the
//   school switches it on (off unless switched on, as at Mirai);
// - months per subject: for each class a child studies, the first day and how
//   many months are paid; the last day is worked out from them.
// Before the migration is pushed the setting, column and table are missing:
// nothing here is read then, and the page loads as before.

const STUDENT_PAGE_SIZE = 1000

export function isMissingDatabaseThing(error: { code?: string } | null | undefined) {
  return error?.code === '42703' || error?.code === 'PGRST204' || error?.code === 'PGRST205' || error?.code === '42P01' || error?.code === '42883' || error?.code === 'PGRST202'
}

// ---------------------------------------------------------------------------
// Student code

export async function fetchStudentCodeEnabled(): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'student_code').maybeSingle()
    if (error || !data) return false
    return (data.value as { enabled?: unknown } | null)?.enabled === true
  } catch {
    return false
  }
}

// Every student's code, read only when the school uses codes.
export async function fetchStudentCodes(): Promise<Map<number, string>> {
  const codes = new Map<number, string>()
  if (!supabase) return codes
  try {
    for (let from = 0; ; from += STUDENT_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('students')
        .select('id, student_code')
        .not('student_code', 'is', null)
        .order('id')
        .range(from, from + STUDENT_PAGE_SIZE - 1)
      if (error) return codes
      for (const row of data ?? []) {
        if (row.student_code) codes.set(row.id, row.student_code)
      }
      if ((data ?? []).length < STUDENT_PAGE_SIZE) return codes
    }
  } catch {
    return codes
  }
}

// Saves a student's code (empty clears it). Throws with a reason to show.
export async function saveStudentCode(studentId: number, next: string, current: string | null | undefined) {
  const value = next.trim() || null
  if (value === (current ?? null) || !supabase) return
  if (value && value.length > 40) {
    throw new Error('A student code can be at most 40 characters.')
  }
  const { error } = await supabase.from('students').update({ student_code: value }).eq('id', studentId)
  if (error) {
    throw new Error(
      error.code === '23505'
        ? `Student code "${value}" is already used by another student.`
        : isMissingDatabaseThing(error)
          ? "The student code can't be saved until the database update for it is applied."
          : error.message,
    )
  }
}

export async function setStudentCodeEnabled(enabled: boolean) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_student_code_enabled', { p_enabled: enabled })
  return error ? error.message || 'Could not change the student code setting.' : null
}

// ---------------------------------------------------------------------------
// Months per subject

export type MonthPlan = {
  id: number
  studentId: number
  classroomId: number
  startDate: string
  months: number
  endDate: string
  remark: string | null
  createdAt: string
}

// Mirrors month_plan_end_date: the day before the same date that many months
// later (1 Nov + 3 months -> 31 Jan). A day the later month lacks (31 Jan + 1
// month) falls back to that month's last day first, as in Postgres.
export function monthPlanEndDate(startDate: string, months: number) {
  const [year, month, day] = startDate.split('-').map(Number)
  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const sameDay = new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
  sameDay.setUTCDate(sameDay.getUTCDate() - 1)
  return sameDay.toISOString().slice(0, 10)
}

// The plan in force for each class: the one that ends last.
export function latestPlanByClass(plans: MonthPlan[]) {
  const latest = new Map<number, MonthPlan>()
  for (const plan of plans) {
    const current = latest.get(plan.classroomId)
    if (!current || plan.endDate > current.endDate || (plan.endDate === current.endDate && plan.id > current.id)) {
      latest.set(plan.classroomId, plan)
    }
  }
  return latest
}

type MonthPlanRow = {
  id: number
  student_id: number
  classroom_id: number
  start_date: string
  months: number
  end_date: string
  remark: string | null
  created_at: string
}

function mapPlan(row: MonthPlanRow): MonthPlan {
  return {
    id: row.id,
    studentId: row.student_id,
    classroomId: row.classroom_id,
    startDate: row.start_date,
    months: row.months,
    endDate: row.end_date,
    remark: row.remark,
    createdAt: row.created_at,
  }
}

// A student's months, newest first. Null when the database does not have them yet.
export async function fetchMonthPlans(studentId: number): Promise<MonthPlan[] | null> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('student_month_plans')
      .select('id, student_id, classroom_id, start_date, months, end_date, remark, created_at')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .order('start_date', { ascending: false })
      .order('id', { ascending: false })
    if (error) {
      if (isMissingDatabaseThing(error)) return null
      throw new Error(error.message)
    }
    return (data ?? []).map(mapPlan)
  } catch (error) {
    if (error instanceof Error && error.message) throw error
    return null
  }
}

// Null when saved, else the reason.
export async function addMonthPlan(input: {
  studentId: number
  classroomId: number
  startDate: string
  months: number
  remark?: string
}) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('add_student_month_plan', {
    p_student_id: input.studentId,
    p_classroom_id: input.classroomId,
    p_start_date: input.startDate,
    p_months: input.months,
    p_remark: input.remark?.trim() || null,
  })
  if (!error) return null
  return isMissingDatabaseThing(error)
    ? "Months can't be saved until the database update for them is applied."
    : error.message || 'Could not save the months.'
}

export async function hideMonthPlan(id: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('hide_student_month_plan', { p_id: id })
  return error ? error.message || 'Could not remove the months.' : null
}
