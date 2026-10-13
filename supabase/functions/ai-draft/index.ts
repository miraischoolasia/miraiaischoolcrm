// AI reply draft for the WhatsApp inbox.
//
// A signed-in staff member who may edit Leads sends the last messages of a chat (phone numbers and
// emails already removed by the browser, and again here), and this function asks Google Gemini for the
// reply the team would write next, using the school knowledge notes an admin keeps in the CRM
// (ai_knowledge_notes; the text bundled in knowledge.ts is used when there are no notes at all). The
// answer is only a suggestion shown as grey text in the message box; nothing is sent from here.
//
// Secrets (set in Supabase, never in the browser):
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional, default gemini-3.5-flash-lite
//   AI_DAILY_CAP     optional, most drafts per day for the whole school, default 300
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { KNOWLEDGE } from './knowledge.ts'
import {
  buildSystemPrompt,
  buildUserPrompt,
  composeKnowledge,
  lastParentText,
  parseModelReply,
  validateInput,
} from './logic.ts'

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

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

// Every note that is switched on, in the order the admin put them. With no notes at all (the table is
// missing or empty) the text bundled with the function is used, so the AI never loses its knowledge.
async function loadKnowledge(admin: ReturnType<typeof createClient>): Promise<string> {
  const { data, error } = await admin
    .from('ai_knowledge_notes')
    .select('title, body, enabled')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    console.error('Could not read the knowledge notes', error.message)
    return KNOWLEDGE
  }
  if (!data || data.length === 0) {
    return KNOWLEDGE
  }
  return composeKnowledge(
    data
      .filter((note: { enabled: boolean }) => note.enabled)
      .map((note: { title: string; body: string }) => ({ title: note.title, body: note.body })),
  )
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
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  }
  if (!geminiKey) {
    return jsonResponse({ ok: false, error: 'The AI key has not been set up yet.' }, 503)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)
  }

  // The caller is identified with their own login, and the permission is checked as them.
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const {
    data: { user },
  } = await callerClient.auth.getUser()
  if (!user) {
    return jsonResponse({ ok: false, error: 'Not authenticated.' }, 401)
  }
  const { data: allowed, error: permissionError } = await callerClient.rpc('has_permission', {
    p_module: 'leads',
    p_action: 'edit',
  })
  if (permissionError || allowed !== true) {
    return jsonResponse({ ok: false, error: 'You do not have permission to use AI drafts.' }, 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const parsed = validateInput(body)
  if (!parsed.ok) {
    return jsonResponse({ ok: false, error: parsed.error }, 400)
  }
  const input = parsed.value

  const admin = createClient(supabaseUrl, serviceRoleKey)

  // The same last message of the same chat is answered once for the whole team.
  if (!input.regenerate) {
    const { data: existing } = await admin
      .from('ai_drafts')
      .select('id, draft, skipped, staff_note, category')
      .eq('chat_id', input.chatId)
      .eq('last_message_id', input.lastMessageId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return jsonResponse(
        {
          ok: true,
          id: existing.id,
          reply: existing.draft ?? '',
          skip: existing.skipped === true,
          staffNote: existing.staff_note ?? '',
          category: existing.category ?? 'other',
          cached: true,
        },
        200,
      )
    }
  }

  const cap = Number(Deno.env.get('AI_DAILY_CAP') ?? '300')
  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('ai_drafts')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', dayStart)
  if ((count ?? 0) >= (Number.isFinite(cap) && cap > 0 ? cap : 300)) {
    return jsonResponse({ ok: false, error: 'The AI draft limit for today has been reached.' }, 429)
  }

  const knowledge = await loadKnowledge(admin)
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  const startedAt = Date.now()
  let answer: string
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt(knowledge) }] },
          contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(25000),
      },
    )
    if (!response.ok) {
      console.error('Gemini error', response.status, (await response.text()).slice(0, 300))
      return jsonResponse({ ok: false, error: 'The AI service did not answer. Try again in a moment.' }, 502)
    }
    const data = await response.json()
    const parts = data?.candidates?.[0]?.content?.parts
    answer = Array.isArray(parts)
      ? parts
          .filter((part: { thought?: boolean; text?: unknown }) => part && part.thought !== true)
          .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
          .join('')
      : ''
  } catch (problem) {
    console.error('Gemini request failed', problem instanceof Error ? problem.message : problem)
    return jsonResponse({ ok: false, error: 'The AI service did not answer. Try again in a moment.' }, 502)
  }

  const result = parseModelReply(answer)
  if (!result) {
    return jsonResponse({ ok: false, error: 'The AI gave an answer that could not be used. Try again.' }, 502)
  }

  const { data: row, error: insertError } = await admin
    .from('ai_drafts')
    .insert({
      requested_by: user.id,
      chat_id: input.chatId,
      last_message_id: input.lastMessageId,
      draft: result.skip ? null : result.reply,
      skipped: result.skip,
      staff_note: result.staffNote || null,
      missing_info: result.missing || null,
      parent_text: lastParentText(input.messages),
      category: result.category,
      model,
      latency_ms: Date.now() - startedAt,
    })
    .select('id')
    .single()
  if (insertError || !row) {
    console.error('Could not log the draft', insertError?.message)
  }

  return jsonResponse(
    {
      ok: true,
      id: row?.id ?? null,
      reply: result.reply,
      skip: result.skip,
      staffNote: result.staffNote,
      missing: result.missing,
      category: result.category,
      cached: false,
    },
    200,
  )
})
