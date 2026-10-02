// Emails the people a form lists (settings.notifyEmails) when a visitor
// finishes it. The public form page calls this right after submitting, with
// the form id and the visitor's session token; the token is the proof that the
// caller really made that submission. Each submission is emailed once
// (form_submissions.notified_at), so calling it again does nothing.
//
// Setup (once):
//   npx supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="Mirai CRM <crm@yourdomain.com>" APP_URL=https://your-crm-address
//   npx supabase functions deploy notify-form-submission --no-verify-jwt
// RESEND_FROM must be an address on a domain verified in Resend; without
// RESEND_FROM the test sender onboarding@resend.dev is used, which only
// delivers to the email address of the Resend account itself.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSubmissionEmail } from './email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailShape = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MAX_RECIPIENTS = 5
// A submission is only emailed while it is fresh.
const FRESH_MINUTES = 30

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRoleKey || !resendKey) {
    return jsonResponse({ ok: false, error: 'Email alerts are not set up.' }, 503)
  }

  let body: { formId?: unknown; token?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const formId = typeof body.formId === 'string' ? body.formId : ''
  const token = typeof body.token === 'string' ? body.token : ''
  if (!uuidShape.test(formId) || !uuidShape.test(token)) {
    return jsonResponse({ ok: false, error: 'Invalid request.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const since = new Date(Date.now() - FRESH_MINUTES * 60_000).toISOString()
  const { data: submission, error: submissionError } = await admin
    .from('form_submissions')
    .select('id, answers, tracking')
    .eq('form_id', formId)
    .eq('session_token', token)
    .eq('status', 'completed')
    .is('notified_at', null)
    .gt('created_at', since)
    .maybeSingle()

  if (submissionError) {
    return jsonResponse({ ok: false, error: 'Could not look up the submission.' }, 500)
  }
  if (!submission) {
    // Unknown, already emailed, or too old: nothing to do.
    return jsonResponse({ ok: true, sent: false })
  }

  const { data: form } = await admin.from('forms').select('name, settings').eq('id', formId).maybeSingle()
  const listed = Array.isArray(form?.settings?.notifyEmails) ? form.settings.notifyEmails : []
  const recipients = listed
    .filter((entry: unknown): entry is string => typeof entry === 'string' && emailShape.test(entry.trim()))
    .map((entry: string) => entry.trim())
    .slice(0, MAX_RECIPIENTS)
  if (!form || recipients.length === 0) {
    return jsonResponse({ ok: true, sent: false })
  }

  // Claim it first, so two calls at the same moment send one email.
  const { data: claimed } = await admin
    .from('form_submissions')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', submission.id)
    .is('notified_at', null)
    .select('id')
  if (!claimed || claimed.length === 0) {
    return jsonResponse({ ok: true, sent: false })
  }

  const answers = (Array.isArray(submission.answers) ? submission.answers : []).flatMap(
    (entry: Record<string, unknown>) =>
      typeof entry?.label === 'string' && typeof entry?.value === 'string'
        ? [{ label: entry.label, value: entry.value }]
        : [],
  )
  const email = buildSubmissionEmail(
    form.name ?? '',
    answers,
    submission.tracking && typeof submission.tracking === 'object' ? submission.tracking : null,
    Deno.env.get('APP_URL') ?? '',
  )

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') ?? 'Mirai CRM <onboarding@resend.dev>',
      to: recipients,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  })

  if (!response.ok) {
    // Let a later call try again.
    await admin.from('form_submissions').update({ notified_at: null }).eq('id', submission.id)
    return jsonResponse({ ok: false, error: 'The email could not be sent.' }, 502)
  }

  return jsonResponse({ ok: true, sent: true })
})
