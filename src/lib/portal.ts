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

export type PortalVisibility = { schedule: boolean; points: boolean; scores: boolean; package: boolean; report: boolean; recordings: boolean }

export type PortalSettings = {
  school_name: string
  accent_color: string
  student_sees: PortalVisibility
  parent_sees: PortalVisibility
  // Where families open the app, and the message sent with a new login ({school} {child} {link} {logins}).
  app_url: string
  login_message: string
  // The app's home on a computer: the classic list, or the game lobby with a
  // picture set the app ships (student-app/public/lobby/<set>/); and the
  // points for one level (Lv) there.
  home_style: 'classic' | 'lobby'
  home_theme: string
  level_points: number
  // The school's WhatsApp for families (digits, country code first): the game
  // sign-in page's "Contact the school". Empty: not shown.
  support_whatsapp: string
}

// The lobby picture sets the student app has (student-app/src/lib/lobbyThemes.ts).
export const studentHomeThemes: Array<{ key: string; label: string }> = [{ key: 'eduhero', label: 'EduHero' }]

export const defaultPortalSettings: PortalSettings = {
  school_name: '',
  accent_color: '#fc0c97',
  student_sees: { schedule: true, points: true, scores: true, package: false, report: false, recordings: true },
  parent_sees: { schedule: true, points: true, scores: true, package: true, report: true, recordings: true },
  app_url: '',
  login_message: '',
  home_style: 'classic',
  home_theme: '',
  level_points: 50,
  support_whatsapp: '',
}

// The student, and the parent the CRM links them to (people.parent_id).
export async function fetchStudentLogins(studentId: number) {
  if (!supabase) return { student: null, parent: null, parentPerson: null, studentContactId: null }
  const { data: person } = await supabase
    .from('people')
    .select('id, parent_id, chatwoot_contact_id')
    .eq('student_id', studentId)
    .limit(1)
    .maybeSingle()
  const parentId = person?.parent_id ?? null
  const [{ data: parentPerson }, { data: accounts, error }] = await Promise.all([
    parentId
      ? supabase.from('people').select('id, full_name, phone, chatwoot_contact_id').eq('id', parentId).maybeSingle()
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
    parentPerson: parentPerson
      ? {
          id: parentPerson.id,
          name: parentPerson.full_name ?? 'Parent',
          phone: parentPerson.phone as string | null,
          contactId: parentPerson.chatwoot_contact_id as number | null,
        }
      : null,
    // The student's own chat, for a student who writes themself.
    studentContactId: (person?.chatwoot_contact_id as number | null | undefined) ?? null,
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
    app_url: value.app_url ?? '',
    login_message: value.login_message ?? '',
    home_style: value.home_style === 'lobby' ? 'lobby' : 'classic',
    home_theme: value.home_theme ?? '',
    level_points: typeof value.level_points === 'number' ? value.level_points : defaultPortalSettings.level_points,
    support_whatsapp: value.support_whatsapp ?? '',
  }
}

export async function savePortalSettings(settings: PortalSettings) {
  if (!supabase) return 'Supabase is not configured.'
  // Empty words are left out, so the settings still save on a database without them.
  // The same for the home choice: a school on the classic home sends none of it.
  const { app_url, login_message, home_style, home_theme, level_points, support_whatsapp, ...rest } = settings
  const whatsapp = support_whatsapp.replace(/\D/g, '')
  const payload = {
    ...rest,
    ...(app_url.trim() ? { app_url: app_url.trim() } : {}),
    ...(login_message.trim() ? { login_message } : {}),
    ...(home_style === 'lobby' ? { home_style, home_theme } : {}),
    ...(level_points !== defaultPortalSettings.level_points ? { level_points } : {}),
    ...(whatsapp ? { support_whatsapp: whatsapp } : {}),
  }
  const { error } = await supabase.rpc('set_portal_settings', { p_settings: payload })
  return error ? error.message || 'Failed to save.' : null
}

// ---------------------------------------------------------------------------
// Parents' consent (PDPA): the school's wording, and what each parent answered

export type ConsentKind = 'ai_analysis' | 'class_recording'

export const consentKinds: ConsentKind[] = ['ai_analysis', 'class_recording']

export type ConsentSetting = { title: string; text: string; required: boolean }

export type ConsentSettings = Record<ConsentKind, ConsentSetting>

export const defaultConsentSettings: ConsentSettings = {
  ai_analysis: { title: 'AI progress reports', text: '', required: false },
  class_recording: { title: 'Class recordings', text: '', required: false },
}

export type StudentConsent = { kind: ConsentKind; granted: boolean; at: string }

export async function fetchConsentSettings(): Promise<ConsentSettings> {
  if (!supabase) return defaultConsentSettings
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'portal_consents').maybeSingle()
  if (error) throw error
  const value = (data?.value ?? {}) as Partial<Record<ConsentKind, Partial<ConsentSetting>>>
  const read = (kind: ConsentKind): ConsentSetting => ({
    title: typeof value[kind]?.title === 'string' ? value[kind].title : defaultConsentSettings[kind].title,
    text: typeof value[kind]?.text === 'string' ? value[kind].text : '',
    required: value[kind]?.required === true,
  })
  return { ai_analysis: read('ai_analysis'), class_recording: read('class_recording') }
}

export async function saveConsentSettings(settings: ConsentSettings) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_portal_consents', { p_settings: settings })
  return error ? error.message || 'Failed to save.' : null
}

// The parent's latest answer for each consent (missing: not answered yet).
export async function fetchStudentConsents(studentId: number): Promise<StudentConsent[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('student_consents')
    .select('kind, granted, created_at')
    .eq('student_id', studentId)
    .order('id', { ascending: false })
    .limit(50)
  if (error) throw error
  const latest = new Map<ConsentKind, StudentConsent>()
  for (const row of data) {
    if (!latest.has(row.kind)) latest.set(row.kind, { kind: row.kind, granted: row.granted, at: row.created_at })
  }
  return consentKinds.flatMap((kind) => (latest.has(kind) ? [latest.get(kind)!] : []))
}

// ---------------------------------------------------------------------------
// The app's terms, agreed at a parent's first sign-in

export type PortalTerms = { title: string; text: string; version: number }

export async function fetchPortalTerms(): Promise<PortalTerms> {
  const empty: PortalTerms = { title: 'Terms and conditions', text: '', version: 0 }
  if (!supabase) return empty
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'portal_terms').maybeSingle()
  if (error) throw error
  const value = (data?.value ?? {}) as Partial<PortalTerms>
  return {
    title: typeof value.title === 'string' ? value.title : empty.title,
    text: typeof value.text === 'string' ? value.text : '',
    version: Number(value.version) || 0,
  }
}

// Resolves to the new version (it goes up when the wording changes), or an error.
export async function savePortalTerms(title: string, text: string): Promise<{ version: number | null; error: string | null }> {
  if (!supabase) return { version: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('set_portal_terms', { p_title: title, p_text: text })
  return error ? { version: null, error: error.message || 'Failed to save.' } : { version: data, error: null }
}

// When this login last agreed to the terms (and which version), or null.
export async function fetchTermsAcceptance(authUserId: string): Promise<{ version: number; at: string } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('portal_terms_acceptances')
    .select('version, accepted_at')
    .eq('auth_user_id', authUserId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { version: data.version, at: data.accepted_at } : null
}

// ---------------------------------------------------------------------------
// The App Logins page: every login, and which parent each student has

const PAGE = 1000

async function everyRow<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

export async function fetchLoginDirectory() {
  if (!supabase) {
    return {
      accounts: [] as PortalAccount[],
      parentOfStudent: new Map<number, number>(),
      parents: new Map<number, { id: number; name: string | null; phone: string | null; contactId: number | null }>(),
      studentContacts: new Map<number, number>(),
    }
  }
  const client = supabase
  const [accountRows, childRows, parentRows] = await Promise.all([
    everyRow((from, to) =>
      client
        .from('portal_accounts')
        .select('auth_user_id, username, kind, student_id, parent_person_id, is_active')
        .order('auth_user_id')
        .range(from, to),
    ),
    everyRow((from, to) =>
      client
        .from('people')
        .select('student_id, parent_id, chatwoot_contact_id')
        .eq('kind', 'student')
        .not('student_id', 'is', null)
        .order('id')
        .range(from, to),
    ),
    everyRow((from, to) =>
      client.from('people').select('id, full_name, phone, chatwoot_contact_id').eq('kind', 'parent').order('id').range(from, to),
    ),
  ])
  const accounts: PortalAccount[] = accountRows.map((row) => ({
    authUserId: row.auth_user_id,
    username: row.username,
    kind: row.kind,
    studentId: row.student_id,
    parentPersonId: row.parent_person_id,
    isActive: row.is_active,
  }))
  const parentOfStudent = new Map<number, number>()
  // The chat of a student who writes themself (Messenger, Instagram or WhatsApp).
  const studentContacts = new Map<number, number>()
  for (const row of childRows) {
    if (row.student_id === null) continue
    if (row.parent_id !== null && !parentOfStudent.has(row.student_id)) parentOfStudent.set(row.student_id, row.parent_id)
    if (row.chatwoot_contact_id !== null && !studentContacts.has(row.student_id)) studentContacts.set(row.student_id, row.chatwoot_contact_id)
  }
  const parents = new Map(
    parentRows.map((row) => [row.id, { id: row.id, name: row.full_name, phone: row.phone, contactId: row.chatwoot_contact_id }]),
  )
  return { accounts, parentOfStudent, parents, studentContacts }
}
