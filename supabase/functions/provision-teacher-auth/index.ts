// Admin-only: creates or resets a teacher's Supabase Auth login.
//
// This is the ONLY place the service-role key is used — setting another
// user's password requires supabase.auth.admin.*, which the browser must
// never be able to call directly.
import { createClient } from 'jsr:@supabase/supabase-js@2'

// Keep in sync with src/lib/auth.ts's usernameToInternalEmail — duplicated
// here because Deno can't import from src/.
function usernameToInternalEmail(username: string): string {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
  return `${normalized}@mirai.internal`
}

type ProvisionRequest =
  | { action: 'create_login'; teacherId: number; password: string }
  | { action: 'reset_password'; teacherId: number; password: string }

// Edge Functions don't add CORS headers automatically — without these, the
// browser's preflight OPTIONS request (or the actual response) gets
// blocked client-side, which surfaces in supabase-js as an opaque
// "Failed to send a request to the Edge Function" with no further detail.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)
  }

  // Identifies the caller using their own JWT against the anon key — this
  // client is never used to bypass RLS.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()

  if (!caller) {
    return jsonResponse({ ok: false, error: 'Not authenticated.' }, 401)
  }

  // Elevated client — only used after the caller is confirmed to be an
  // active admin below.
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: callerTeacher, error: callerTeacherError } = await adminClient
    .from('teachers')
    .select('role, is_active')
    .eq('auth_user_id', caller.id)
    .maybeSingle()

  if (callerTeacherError || !callerTeacher || callerTeacher.role !== 'admin' || !callerTeacher.is_active) {
    return jsonResponse({ ok: false, error: 'Only active admins can manage teacher logins.' }, 403)
  }

  let body: ProvisionRequest
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  if (
    !body ||
    (body.action !== 'create_login' && body.action !== 'reset_password') ||
    !Number.isFinite(body.teacherId) ||
    typeof body.password !== 'string'
  ) {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  if (body.password.length < 8) {
    return jsonResponse({ ok: false, error: 'Password must be at least 8 characters.' }, 400)
  }

  const { data: targetTeacher, error: targetTeacherError } = await adminClient
    .from('teachers')
    .select('id, username, auth_user_id')
    .eq('id', body.teacherId)
    .maybeSingle()

  if (targetTeacherError || !targetTeacher) {
    return jsonResponse({ ok: false, error: 'Teacher not found.' }, 404 )
  }

  const syntheticEmail = usernameToInternalEmail(targetTeacher.username)

  if (body.action === 'create_login') {
    if (targetTeacher.auth_user_id) {
      return jsonResponse(
        { ok: false, error: 'This teacher already has a login. Use reset_password instead.' },
        409,
      )
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: syntheticEmail,
      password: body.password,
      email_confirm: true,
    })

    if (createError || !created?.user) {
      return jsonResponse({ ok: false, error: createError?.message ?? 'Failed to create login.' }, 500)
    }

    const { error: linkError } = await adminClient
      .from('teachers')
      .update({ auth_user_id: created.user.id })
      .eq('id', targetTeacher.id)

    if (linkError) {
      return jsonResponse({ ok: false, error: 'Login created but failed to link to teacher record.' }, 500)
    }

    return jsonResponse({ ok: true, authUserId: created.user.id }, 200)
  }

  // reset_password
  if (!targetTeacher.auth_user_id) {
    return jsonResponse(
      { ok: false, error: 'This teacher has no login yet. Use create_login instead.' },
      409,
    )
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(targetTeacher.auth_user_id, {
    password: body.password,
  })

  if (updateError) {
    return jsonResponse({ ok: false, error: updateError.message }, 500)
  }

  return jsonResponse({ ok: true, authUserId: targetTeacher.auth_user_id }, 200)
})
