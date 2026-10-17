// AI reply draft for the WhatsApp inbox.
//
// A signed-in staff member who may edit Leads sends the last messages of a chat (phone numbers and
// emails already removed by the browser, and again here), and this function asks Google Gemini for the
// reply the team would write next, using the school knowledge notes an admin keeps in the CRM
// (ai_knowledge_notes; the text bundled in knowledge.ts is used when there are no notes at all). The
// answer is only a suggestion shown as grey text in the message box; nothing is sent from here.
//
// The same function also explains, for an admin, why the team replied the way it did instead of the
// draft (mode 'lesson'); that answer is shown on the AI Knowledge page and is not stored.
//
// Secrets (set in Supabase, never in the browser):
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional, default gemini-3.5-flash-lite
//   AI_DAILY_CAP     optional, most drafts per day for the whole school, default 300
//   SCHOOL_NAME      optional, the school's name in the AI's instructions, default Mirai AI School. A school
//                    other than Mirai never falls back to the bundled Mirai text: with no notes its AI
//                    has no school facts until an admin writes them in the CRM.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { KNOWLEDGE } from './knowledge.ts'
import {
  DEFAULT_SCHOOL_NAME,
  buildSystemPrompt,
  buildUserPrompt,
  composeKnowledge,
  buildLessonSystemPrompt,
  buildLessonUserPrompt,
  lastParentText,
  parseLesson,
  parseModelReply,
  validateInput,
  validateLessonInput,
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

// A short, key-free reason from Google's error answer, shown to the team so a failure can be understood
// without opening the function logs: "Gemini 429: Resource has been exhausted ...".
function whyGeminiFailed(status: number, body: string, key: string) {
  let message = ''
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown; status?: unknown } }
    const text = typeof parsed?.error?.message === 'string' ? parsed.error.message : ''
    const code = typeof parsed?.error?.status === 'string' ? parsed.error.status : ''
    message = [code, text].filter(Boolean).join(' - ')
  } catch {
    message = body
  }
  return `Gemini ${status}: ${message}`.replace(/\s+/g, ' ').split(key).join('***').slice(0, 220)
}

// Every note that is switched on, in the order the admin put them. With no notes at all (the table is
// missing or empty) Mirai's deployment uses the text bundled with the function, so its AI never loses its
// knowledge; another school gets nothing, because the bundled text is Mirai's courses and prices.
async function loadKnowledge(admin: ReturnType<typeof createClient>, schoolName: string): Promise<string> {
  const bundled = schoolName === DEFAULT_SCHOOL_NAME ? KNOWLEDGE : ''
  const { data, error } = await admin
    .from('ai_knowledge_notes')
    .select('title, body, enabled')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    console.error('Could not read the knowledge notes', error.message)
    return bundled
  }
  if (!data || data.length === 0) {
    return bundled
  }
  return composeKnowledge(
    data
      .filter((note: { enabled: boolean }) => note.enabled)
      .map((note: { title: string; body: string }) => ({ title: note.title, body: note.body })),
  )
}

// Asks Gemini one question and returns its text. Google sometimes hangs or answers "busy" for a moment, so
// the request is tried twice (20 s, then 25 s); a wrong key or a bad request is not tried again. On failure the
// error is a sentence for the team, with a short key-free reason.
async function askGemini(
  geminiKey: string,
  model: string,
  system: string,
  user: string,
  config: { temperature: number; maxOutputTokens: number },
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const timeouts = [20000, 25000]
  const retryable = [429, 500, 502, 503, 504]
  for (let attempt = 0; attempt < timeouts.length; attempt += 1) {
    const last = attempt === timeouts.length - 1
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { ...config, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(timeouts[attempt]),
        },
      )
      if (!response.ok) {
        const body = (await response.text()).slice(0, 600)
        console.error('Gemini error', response.status, body.slice(0, 300))
        if (!last && retryable.includes(response.status)) {
          continue
        }
        return {
          ok: false,
          error: `The AI service did not answer (${whyGeminiFailed(response.status, body, geminiKey)}). Try again in a moment.`,
        }
      }
      const data = await response.json()
      const parts = data?.candidates?.[0]?.content?.parts
      const answer = Array.isArray(parts)
        ? parts
            .filter((part: { thought?: boolean; text?: unknown }) => part && part.thought !== true)
            .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
            .join('')
        : ''
      return { ok: true, answer }
    } catch (problem) {
      console.error('Gemini request failed', problem instanceof Error ? problem.message : problem)
      if (!last) {
        continue
      }
      const reason =
        problem instanceof Error
          ? `${problem.name}: ${problem.message}`.slice(0, 160).split(geminiKey).join('***')
          : 'unknown'
      return { ok: false, error: `The AI service did not answer (${reason}). Try again in a moment.` }
    }
  }
  return { ok: false, error: 'The AI service did not answer. Try again in a moment.' }
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
  // An admin asks why the team answered a chat the way it did; nothing is stored.
  if ((body as { mode?: unknown } | null)?.mode === 'lesson') {
    const { data: isAdmin } = await callerClient.rpc('is_admin')
    if (isAdmin !== true) {
      return jsonResponse({ ok: false, error: 'Only an admin can ask for an explanation.' }, 403)
    }
    const checked = validateLessonInput(body)
    if (!checked.ok) {
      return jsonResponse({ ok: false, error: checked.error }, 400)
    }
    const lessonSchool = Deno.env.get('SCHOOL_NAME')?.trim() || DEFAULT_SCHOOL_NAME
    const lessonAnswer = await askGemini(
      geminiKey,
      Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
      buildLessonSystemPrompt(lessonSchool),
      buildLessonUserPrompt(checked.value),
      { temperature: 0.2, maxOutputTokens: 512 },
    )
    if (!lessonAnswer.ok) {
      return jsonResponse({ ok: false, error: lessonAnswer.error }, 502)
    }
    const lesson = parseLesson(lessonAnswer.answer)
    if (!lesson) {
      return jsonResponse({ ok: false, error: 'The AI gave an answer that could not be used. Try again.' }, 502)
    }
    return jsonResponse({ ok: true, lesson }, 200)
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

  const schoolName = Deno.env.get('SCHOOL_NAME')?.trim() || DEFAULT_SCHOOL_NAME
  const knowledge = await loadKnowledge(admin, schoolName)
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  const startedAt = Date.now()
  const asked = await askGemini(geminiKey, model, buildSystemPrompt(knowledge, schoolName), buildUserPrompt(input), {
    temperature: 0.4,
    maxOutputTokens: 1024,
  })
  if (!asked.ok) {
    return jsonResponse({ ok: false, error: asked.error }, 502)
  }
  const answer = asked.answer

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
