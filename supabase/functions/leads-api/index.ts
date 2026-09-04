// Public-facing API for creating/updating leads from external sources
// (a future WhatsApp Cloud API webhook, a website contact form, Zapier,
// etc.). Authenticated with a static secret API key rather than a
// Supabase session, since callers here are other systems, not logged-in
// staff — so this talks to the database with the service-role key
// (bypassing RLS) the same way provision-teacher-auth does, and the API
// key is the only gate.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

const VALID_SOURCES = ['walk_in', 'referral', 'social_media', 'advertisement', 'other']

// Loose match key for dedupe: keep only digits and a leading '+', so
// "+6012-345 6789" and "60123456789" are treated as the same number.
function normalizePhone(phone: string): string {
  return phone.trim().replace(/(?!^\+)[^\d]/g, '')
}

type LeadPayload = {
  phone: string
  fullName?: string
  source?: string
  notes?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const expectedApiKey = Deno.env.get('LEADS_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!expectedApiKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  }

  const providedApiKey = req.headers.get('x-api-key')
  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    return jsonResponse({ ok: false, error: 'Invalid or missing API key.' }, 401)
  }

  let body: LeadPayload
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  if (!phone) {
    return jsonResponse({ ok: false, error: 'phone is required.' }, 400)
  }

  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const source = VALID_SOURCES.includes(body.source ?? '') ? (body.source as string) : 'other'
  const normalizedPhone = normalizePhone(phone)

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Dedupe by phone: pull existing leads and compare normalized numbers
  // (the table has no normalized-phone column/index to query directly).
  const { data: existingLeads, error: fetchError } = await admin
    .from('leads')
    .select('id, full_name, phone, notes, follow_ups')
    .not('phone', 'is', null)

  if (fetchError) {
    return jsonResponse({ ok: false, error: fetchError.message }, 500)
  }

  const existing = existingLeads?.find(
    (lead) => lead.phone && normalizePhone(lead.phone as unknown as string) === normalizedPhone,
  )

  const todayString = new Date().toISOString().slice(0, 10)

  if (existing) {
    const followUps = Array.isArray(existing.follow_ups) ? existing.follow_ups : []
    const nextFollowUps =
      followUps.length < 7
        ? [...followUps, { date: todayString, note: notes || 'New inquiry received via API.' }]
        : followUps

    const { error: updateError } = await admin
      .from('leads')
      .update({
        full_name: existing.full_name || fullName || null,
        follow_ups: nextFollowUps,
      })
      .eq('id', existing.id)

    if (updateError) {
      return jsonResponse({ ok: false, error: updateError.message }, 500)
    }

    await admin.from('admin_activity_logs').insert({
      actor_teacher_id: null,
      action_type: 'lead_updated_via_api',
      entity_type: 'lead',
      entity_id: existing.id,
      entity_label: existing.full_name || fullName || 'Unnamed Lead',
      details: { phone, source },
    })

    return jsonResponse({ ok: true, leadId: existing.id, merged: true }, 200)
  }

  const { data: created, error: createError } = await admin
    .from('leads')
    .insert({
      full_name: fullName || null,
      phone,
      source,
      status: 'new',
      notes: notes || null,
      added_date: todayString,
    })
    .select('id')
    .single()

  if (createError || !created) {
    return jsonResponse({ ok: false, error: createError?.message ?? 'Failed to create lead.' }, 500)
  }

  await admin.from('admin_activity_logs').insert({
    actor_teacher_id: null,
    action_type: 'lead_created_via_api',
    entity_type: 'lead',
    entity_id: created.id,
    entity_label: fullName || 'Unnamed Lead',
    details: { phone, source },
  })

  return jsonResponse({ ok: true, leadId: created.id, merged: false }, 200)
})
