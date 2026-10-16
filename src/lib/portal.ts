import { supabase } from './supabase'

// The CRM side of the student app: who has a login, making and changing
// logins (through the portal-accounts function), and what the app shows.

export type PortalAccount = {
  authUserId: string
  username: string
  kind: 'student' | 'parent'
  studentId: number | null
  parentPersonId: number | null
  isActive: boolean
}

export type PortalVisibility = { schedule: boolean; points: boolean; scores: boolean; package: boolean }

export type PortalSettings = {
  school_name: string
  accent_color: string
  student_sees: PortalVisibility
  parent_sees: PortalVisibility
}

export const defaultPortalSettings: PortalSettings = {
  school_name: '',
  accent_color: '#fc0c97',
  student_sees: { schedule: true, points: true, scores: true, package: false },
  parent_sees: { schedule: true, points: true, scores: true, package: true },
}

// The student, and the parent the CRM links them to (people.parent_id).
export async function fetchStudentLogins(studentId: number) {
  if (!supabase) return { student: null, parent: null, parentPerson: null }
  const { data: person } = await supabase.from('people').select('id, parent_id').eq('student_id', studentId).limit(1).maybeSingle()
  const parentId = person?.parent_id ?? null
  const [{ data: parentPerson }, { data: accounts, error }] = await Promise.all([
    parentId
      ? supabase.from('people').select('id, full_name').eq('id', parentId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('portal_accounts')
      .select('auth_user_id, username, kind, student_id, parent_person_id, is_active')
      .or(parentId ? `student_id.eq.${studentId},parent_person_id.eq.${parentId}` : `student_id.eq.${studentId}`),
  ])
  if (error) throw error
  const mapped: PortalAccount[] = (accounts ?? []).map((row) => ({
    authUserId: row.auth_user_id,
    username: row.username,
    kind: row.kind,
    studentId: row.student_id,
    parentPersonId: row.parent_person_id,
    isActive: row.is_active,
  }))
  return {
    student: mapped.find((account) => account.kind === 'student') ?? null,
    parent: mapped.find((account) => account.kind === 'parent') ?? null,
    parentPerson: parentPerson ? { id: parentPerson.id, name: parentPerson.full_name ?? 'Parent' } : null,
  }
}

type FunctionAnswer = { ok: boolean; error?: string; username?: string; password?: string }

async function callPortalAccounts(body: Record<string, unknown>): Promise<FunctionAnswer> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.functions.invoke('portal-accounts', { body })
  if (error) {
    let reason = error.message
    try {
      const context = (error as { context?: Response }).context
      const answer = context ? await context.json() : null
      if (answer?.error) reason = answer.error
    } catch {
      // keep the general message
    }
    return { ok: false, error: reason || 'The login could not be changed.' }
  }
  return (data as FunctionAnswer) ?? { ok: false, error: 'No answer.' }
}

export function createStudentLogin(studentId: number, username?: string) {
  return callPortalAccounts({ action: 'create', kind: 'student', studentId, username: username || undefined })
}

export function createParentLogin(personId: number, username?: string) {
  return callPortalAccounts({ action: 'create', kind: 'parent', personId, username: username || undefined })
}

export function resetPortalPassword(authUserId: string) {
  return callPortalAccounts({ action: 'reset_password', authUserId })
}

export function setPortalLoginActive(authUserId: string, active: boolean) {
  return callPortalAccounts({ action: 'set_active', authUserId, active })
}

export async function fetchPortalSettings(): Promise<PortalSettings> {
  if (!supabase) return defaultPortalSettings
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'student_portal').maybeSingle()
  if (error) throw error
  const value = (data?.value ?? {}) as Partial<PortalSettings>
  return {
    school_name: value.school_name ?? '',
    accent_color: value.accent_color ?? defaultPortalSettings.accent_color,
    student_sees: { ...defaultPortalSettings.student_sees, ...(value.student_sees ?? {}) },
    parent_sees: { ...defaultPortalSettings.parent_sees, ...(value.parent_sees ?? {}) },
  }
}

export async function savePortalSettings(settings: PortalSettings) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_portal_settings', { p_settings: settings })
  return error ? error.message || 'Failed to save.' : null
}
