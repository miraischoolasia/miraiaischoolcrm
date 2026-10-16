// Logins for the student app: create one for a child or a parent, give a new
// password, or switch one off / on. Only staff who may edit students.
//
// This is the only place that creates or changes those logins, because it
// needs the service-role key (supabase.auth.admin.*), which the browser must
// never have. The password is returned once, to show the admin; it is never
// stored anywhere readable.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  USERNAME_PATTERN,
  firstFreeUsername,
  friendlyPassword,
  portalEmail,
  suggestUsername,
} from './logic.ts'

type Request =
  | { action: 'create'; kind: 'student'; studentId: number; username?: string }
  | { action: 'create'; kind: 'parent'; personId: number; username?: string }
  | { action: 'reset_password'; authUserId: string }
  | { action: 'set_active'; authUserId: string; active: boolean }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: allowed } = await caller.rpc('has_permission', { p_module: 'students', p_action: 'edit' })
  if (allowed !== true) return jsonResponse({ ok: false, error: 'Only staff who may edit students can manage app logins.' }, 403)
  const { data: callerTeacherId } = await caller.rpc('current_teacher_id')

  let body: Request
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  if (body.action === 'reset_password' || body.action === 'set_active') {
    const { data: account } = await admin.from('portal_accounts').select('auth_user_id, username').eq('auth_user_id', body.authUserId).maybeSingle()
    if (!account) return jsonResponse({ ok: false, error: 'Login not found.' }, 404)

    if (body.action === 'reset_password') {
      const password = friendlyPassword()
      const { error } = await admin.auth.admin.updateUserById(account.auth_user_id, { password })
      if (error) return jsonResponse({ ok: false, error: error.message }, 500)
      return jsonResponse({ ok: true, username: account.username, password }, 200)
    }

    // Off: the account is marked and the login is banned, so a signed-in app
    // also stops working when its session renews.
    const { error: banError } = await admin.auth.admin.updateUserById(account.auth_user_id, {
      ban_duration: body.active ? 'none' : '876000h',
    })
    if (banError) return jsonResponse({ ok: false, error: banError.message }, 500)
    const { error } = await admin.from('portal_accounts').update({ is_active: body.active }).eq('auth_user_id', account.auth_user_id)
    if (error) return jsonResponse({ ok: false, error: error.message }, 500)
    return jsonResponse({ ok: true }, 200)
  }

  if (body.action !== 'create') return jsonResponse({ ok: false, error: 'Unknown action.' }, 400)

  // Who the login is for, read as the caller (so they must be able to see them).
  let fullName = ''
  let fallback = ''
  if (body.kind === 'student') {
    const { data: student } = await caller.from('students').select('id, full_name, auth_user_id').eq('id', body.studentId).maybeSingle()
    if (!student) return jsonResponse({ ok: false, error: 'Student not found.' }, 404)
    if (student.auth_user_id) return jsonResponse({ ok: false, error: 'This student already has a login.' }, 409)
    fullName = student.full_name
    fallback = `student${student.id}`
  } else if (body.kind === 'parent') {
    const { data: person } = await caller.from('people').select('id, kind, full_name, auth_user_id').eq('id', body.personId).maybeSingle()
    if (!person || person.kind !== 'parent') return jsonResponse({ ok: false, error: 'Parent not found.' }, 404)
    if (person.auth_user_id) return jsonResponse({ ok: false, error: 'This parent already has a login.' }, 409)
    fullName = person.full_name ?? ''
    fallback = `parent${person.id}`
  } else {
    return jsonResponse({ ok: false, error: 'Say whether the login is for a student or a parent.' }, 400)
  }

  let username = (body.username ?? '').trim().toLowerCase()
  if (username) {
    if (!USERNAME_PATTERN.test(username)) {
      return jsonResponse({ ok: false, error: 'A login name is 3-40 small letters, numbers, dots, dashes or underscores.' }, 400)
    }
    const { data: taken } = await admin.from('portal_accounts').select('username').eq('username', username).maybeSingle()
    if (taken) return jsonResponse({ ok: false, error: `"${username}" is taken. Try another.` }, 409)
  } else {
    const base = suggestUsername(fullName, fallback)
    const { data: similar } = await admin.from('portal_accounts').select('username').like('username', `${base}%`)
    username = firstFreeUsername(base, new Set((similar ?? []).map((row: { username: string }) => row.username)))
  }

  const password = friendlyPassword()
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: portalEmail(username),
    password,
    email_confirm: true,
    user_metadata: { portal: body.kind },
  })
  if (createError || !created.user) {
    return jsonResponse({ ok: false, error: createError?.message ?? 'Could not create the login.' }, 500)
  }
  const authUserId = created.user.id

  const { error: accountError } = await admin.from('portal_accounts').insert({
    auth_user_id: authUserId,
    username,
    kind: body.kind,
    student_id: body.kind === 'student' ? body.studentId : null,
    parent_person_id: body.kind === 'parent' ? body.personId : null,
    created_by: callerTeacherId ?? null,
  })
  const { error: linkError } = accountError
    ? { error: accountError }
    : body.kind === 'student'
      ? await admin.from('students').update({ auth_user_id: authUserId }).eq('id', body.studentId)
      : await admin.from('people').update({ auth_user_id: authUserId }).eq('id', body.personId)

  if (accountError || linkError) {
    // Leave nothing half made.
    await admin.from('portal_accounts').delete().eq('auth_user_id', authUserId)
    await admin.auth.admin.deleteUser(authUserId)
    return jsonResponse({ ok: false, error: (accountError ?? linkError)?.message ?? 'Could not save the login.' }, 500)
  }

  return jsonResponse({ ok: true, authUserId, username, password }, 200)
})
