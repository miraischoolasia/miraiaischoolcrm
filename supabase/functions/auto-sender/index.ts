// The door the WhatsApp server's sender program uses to send automation messages by itself.
//
//   POST /functions/v1/auto-sender   header x-sender-key: <the sender key>
//   { "action": "claim" }                                  -> { ok, message: { id, phone, message, ... } | null }
//   { "action": "finish", "id": 12, "result": "sent" | "failed" | "blocked", "error": "..." }
//
// Nothing is decided here. The database hands out one message at a time and only when every safety
// rule holds (the flow sends by itself, not paused, inside the hours, under the daily limit, past the
// gap, not on the STOP list); the key is checked there too. See migration 20261017000000_auto_send.sql.
//
// Deploy (once, and after changes):
//   npx supabase functions deploy auto-sender --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const RESULTS = ['sent', 'failed', 'blocked']

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Not set up.' }, 503)
  }

  const key = req.headers.get('x-sender-key') ?? ''
  if (key.length < 16 || key.length > 200) {
    return jsonResponse({ ok: false, error: 'The key is not right.' }, 401)
  }

  let body: { action?: unknown; id?: unknown; result?: unknown; error?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  if (body.action === 'claim') {
    const { data, error } = await admin.rpc('automation_claim_auto', { p_key: key })
    if (error) {
      if (error.code === '28000') {
        return jsonResponse({ ok: false, error: 'The key is not right.' }, 401)
      }
      console.error('Could not claim', error.code, error.message)
      return jsonResponse({ ok: false, error: 'Could not claim.' }, 500)
    }
    const row = Array.isArray(data) ? (data[0] ?? null) : null
    return jsonResponse({ ok: true, message: row })
  }

  if (body.action === 'finish') {
    const id = typeof body.id === 'number' && Number.isInteger(body.id) ? body.id : null
    const result = typeof body.result === 'string' && RESULTS.includes(body.result) ? body.result : null
    if (id === null || result === null) {
      return jsonResponse({ ok: false, error: 'Needs an id and a result.' }, 400)
    }
    const text = typeof body.error === 'string' ? body.error.slice(0, 900) : null
    const { error } = await admin.rpc('automation_finish_auto', {
      p_key: key,
      p_id: id,
      p_result: result,
      p_error: text,
    })
    if (error) {
      if (error.code === '28000') {
        return jsonResponse({ ok: false, error: 'The key is not right.' }, 401)
      }
      console.error('Could not finish', error.code, error.message)
      return jsonResponse({ ok: false, error: 'Could not save.' }, 500)
    }
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ ok: false, error: 'Unknown action.' }, 400)
})
