// Content Studio's AI (Marketing > Content Studio).
//
// POST { mode: 'plan', briefId }               the brief's first plan: item_count rows
// POST { mode: 'more', briefId, count }        "a few more" rows, different from the ones already there
// POST { mode: 'read_pdf', briefId, path }     the words in one of the brief's PDFs (returned, not saved)
//
// The caller must be allowed to edit Content Studio (has_permission('content_studio', 'edit')), checked as
// themselves. Plan rows are saved as drafts in content_items; every call is written to content_ai_usage, and
// the school's daily limit (content_studio_settings.daily_limit, Malaysia day) is checked first.
// The AI provider is the school's setting; only Gemini is connected in phase 1.
//
// Secrets (set in Supabase, never in the browser):
//   GEMINI_API_KEY        required (the same key as ai-draft)
//   CONTENT_TEXT_MODEL    optional, else GEMINI_MODEL, else gemini-3.5-flash-lite
//   SCHOOL_NAME           optional, used when the Brand page has no name
//   GEMINI_API_BASE       optional, only for the local test (a stand-in for Google)
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import {
  CONTENT_SIZES,
  MAX_PDF_BYTES,
  PDF_SYSTEM_PROMPT,
  addMustInclude,
  buildSlots,
  buildSystemPrompt,
  buildUserPrompt,
  malaysiaDayStart,
  parsePdfText,
  parsePlan,
  validateRequest,
  type ContentAngle,
  type ContentBrief,
  type ContentKind,
  type ContentSize,
  type ContentStyle,
  type PlanRow,
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
const DEFAULT_SCHOOL_NAME = 'Mirai AI School'
// Rows asked for in one question; a bigger plan is asked in parts at the same time.
const ROWS_PER_QUESTION = 6

type Part = { text: string } | { inline_data: { mime_type: string; data: string } }

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

// One question to Gemini, tried twice when Google is busy or slow; a wrong key or bad request is not
// tried again. The error is a sentence for the team with a short key-free reason.
async function askGemini(
  key: string,
  model: string,
  system: string,
  parts: Part[],
  config: { temperature: number; maxOutputTokens: number },
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const base = (Deno.env.get('GEMINI_API_BASE') || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
  const timeouts = [60000, 50000]
  const retryable = [429, 500, 502, 503, 504]
  for (let attempt = 0; attempt < timeouts.length; attempt += 1) {
    const last = attempt === timeouts.length - 1
    try {
      const response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { ...config, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(timeouts[attempt]),
      })
      if (!response.ok) {
        const body = (await response.text()).slice(0, 600)
        console.error('Gemini error', response.status, body.slice(0, 300))
        if (!last && retryable.includes(response.status)) continue
        return { ok: false, error: `The AI service did not answer (${whyGeminiFailed(response.status, body, key)}). Try again in a moment.` }
      }
      const data = await response.json()
      const answerParts = data?.candidates?.[0]?.content?.parts
      const answer = Array.isArray(answerParts)
        ? answerParts
            .filter((part: { thought?: boolean }) => part && part.thought !== true)
            .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
            .join('')
        : ''
      return { ok: true, answer }
    } catch (problem) {
      console.error('Gemini request failed', problem instanceof Error ? problem.message : problem)
      if (!last) continue
      const reason = problem instanceof Error ? `${problem.name}: ${problem.message}`.slice(0, 160).split(key).join('***') : 'unknown'
      return { ok: false, error: `The AI service did not answer (${reason}). Try again in a moment.` }
    }
  }
  return { ok: false, error: 'The AI service did not answer. Try again in a moment.' }
}

const asSizes = (value: unknown): ContentSize[] =>
  Array.isArray(value) ? value.filter((size): size is ContentSize => (CONTENT_SIZES as readonly string[]).includes(size)) : []

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

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const {
    data: { user },
  } = await callerClient.auth.getUser()
  if (!user) {
    return jsonResponse({ ok: false, error: 'Not authenticated.' }, 401)
  }
  const { data: allowed, error: permissionError } = await callerClient.rpc('has_permission', {
    p_module: 'content_studio',
    p_action: 'edit',
  })
  if (permissionError || allowed !== true) {
    return jsonResponse({ ok: false, error: 'You do not have permission to use Content Studio.' }, 403)
  }
  const { data: teacherId } = await callerClient.rpc('current_teacher_id')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const checked = validateRequest(body)
  if (!checked.ok) {
    return jsonResponse({ ok: false, error: checked.error }, 400)
  }
  const request = checked.value

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: settingsRow } = await admin.from('content_studio_settings').select('*').eq('id', 1).maybeSingle()
  const settings = {
    voice: typeof settingsRow?.voice === 'string' ? settingsRow.voice : '',
    bannedWords: Array.isArray(settingsRow?.banned_words) ? (settingsRow.banned_words as string[]) : [],
    mustInclude: Array.isArray(settingsRow?.must_include) ? (settingsRow.must_include as string[]) : [],
    dailyLimit: typeof settingsRow?.daily_limit === 'number' ? settingsRow.daily_limit : 60,
    provider: settingsRow?.text_provider === 'openai' ? 'openai' : 'gemini',
  }
  if (settings.provider !== 'gemini') {
    return jsonResponse(
      { ok: false, error: 'OpenAI is not connected yet. An admin can switch the AI back to Gemini in Content Studio > Settings.' },
      503,
    )
  }
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!geminiKey) {
    return jsonResponse({ ok: false, error: 'The AI key has not been set up yet.' }, 503)
  }
  const model = Deno.env.get('CONTENT_TEXT_MODEL') || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL

  const { data: brief } = await admin.from('content_briefs').select('*').eq('id', request.briefId).maybeSingle()
  if (!brief) {
    return jsonResponse({ ok: false, error: 'That brief was not found.' }, 404)
  }

  const { data: existing } = await admin
    .from('content_items')
    .select('headline, sort_order')
    .eq('brief_id', request.briefId)
    .order('sort_order', { ascending: true })
  const existingRows = (existing ?? []) as { headline: string; sort_order: number }[]

  if (request.mode === 'plan' && existingRows.length > 0) {
    return jsonResponse({ ok: false, error: 'This brief already has a plan. Use "A few more" to add rows.' }, 409)
  }

  const units = request.mode === 'read_pdf' ? 1 : request.mode === 'plan' ? Number(brief.item_count) || 1 : request.count
  const { data: usedRows } = await admin
    .from('content_ai_usage')
    .select('units')
    .eq('ok', true)
    .gte('created_at', malaysiaDayStart(new Date()))
  const used = ((usedRows ?? []) as { units: number }[]).reduce((sum, row) => sum + (row.units || 0), 0)
  if (used + units > settings.dailyLimit) {
    return jsonResponse(
      {
        ok: false,
        error: `Today's AI limit is reached (${used} of ${settings.dailyLimit} used, this needs ${units}). It starts again at midnight, or an admin can raise it in Settings.`,
      },
      429,
    )
  }

  const startedAt = Date.now()
  const logUsage = (row: { ok: boolean; units: number; error?: string }) =>
    admin.from('content_ai_usage').insert({
      teacher_id: typeof teacherId === 'number' ? teacherId : null,
      brief_id: request.briefId,
      action: request.mode,
      provider: 'gemini',
      model,
      units: row.units,
      ok: row.ok,
      error: row.error ? row.error.slice(0, 300) : null,
      latency_ms: Date.now() - startedAt,
    })

  // ---- The words in a PDF -----------------------------------------------------------------------------
  if (request.mode === 'read_pdf') {
    const { data: file, error: downloadError } = await admin.storage.from('content-files').download(request.path)
    if (downloadError || !file) {
      return jsonResponse({ ok: false, error: 'That PDF could not be opened.' }, 404)
    }
    if (file.size > MAX_PDF_BYTES) {
      return jsonResponse({ ok: false, error: 'That PDF is too big to read (15 MB at most).' }, 413)
    }
    const data = encodeBase64(new Uint8Array(await file.arrayBuffer()))
    const asked = await askGemini(geminiKey, model, PDF_SYSTEM_PROMPT, [{ inline_data: { mime_type: 'application/pdf', data } }], {
      temperature: 0,
      maxOutputTokens: 8192,
    })
    if (!asked.ok) {
      await logUsage({ ok: false, units: 0, error: asked.error })
      return jsonResponse({ ok: false, error: asked.error }, 502)
    }
    const text = parsePdfText(asked.answer)
    if (!text) {
      await logUsage({ ok: false, units: 0, error: 'No words came back' })
      return jsonResponse({ ok: false, error: 'No words could be read from that PDF.' }, 502)
    }
    await logUsage({ ok: true, units: 1 })
    return jsonResponse({ ok: true, text }, 200)
  }

  // ---- Plan rows ----------------------------------------------------------------------------------------
  const styleIds = Array.isArray(brief.style_ids) ? (brief.style_ids as number[]) : []
  const angleIds = Array.isArray(brief.angle_ids) ? (brief.angle_ids as number[]) : []
  const [{ data: styleRows }, { data: angleRows }, { data: branding }] = await Promise.all([
    styleIds.length > 0
      ? admin.from('content_styles').select('id, name, description').in('id', styleIds)
      : Promise.resolve({ data: [] }),
    angleIds.length > 0
      ? admin.from('content_angles').select('id, name, description, examples').in('id', angleIds)
      : Promise.resolve({ data: [] }),
    admin.from('app_settings').select('value').eq('key', 'crm_branding').maybeSingle(),
  ])
  // In the order the brief lists them.
  const styles = styleIds
    .map((id) => ((styleRows ?? []) as ContentStyle[]).find((style) => style.id === id))
    .filter((style): style is ContentStyle => Boolean(style))
  const angles = angleIds
    .map((id) => ((angleRows ?? []) as ContentAngle[]).find((angle) => angle.id === id))
    .filter((angle): angle is ContentAngle => Boolean(angle))
    .map((angle) => ({ ...angle, examples: Array.isArray(angle.examples) ? angle.examples : [] }))

  const kind: ContentKind = brief.kind === 'carousel' || brief.kind === 'caption' ? brief.kind : 'single'
  const sizes = asSizes(brief.sizes)
  const contentBrief: ContentBrief = {
    title: String(brief.title ?? ''),
    topic: String(brief.topic ?? ''),
    keyPoints: String(brief.key_points ?? ''),
    audience: String(brief.audience ?? ''),
    callToAction: String(brief.call_to_action ?? ''),
    pdfText: String(brief.pdf_text ?? ''),
    sizes,
    kind,
    carouselPages: Number(brief.carousel_pages) || 5,
  }
  const brandName = typeof branding?.value?.name === 'string' ? branding.value.name.trim() : ''
  const schoolName = brandName || Deno.env.get('SCHOOL_NAME')?.trim() || DEFAULT_SCHOOL_NAME
  const system = buildSystemPrompt(settings, schoolName)

  const slots = buildSlots(styles, angles, sizes, units, existingRows.length)
  const avoid = existingRows.map((row) => row.headline).filter(Boolean)
  const groups: (typeof slots)[] = []
  for (let at = 0; at < slots.length; at += ROWS_PER_QUESTION) {
    // Each question numbers its rows from 1.
    groups.push(slots.slice(at, at + ROWS_PER_QUESTION).map((slot, index) => ({ ...slot, slot: index + 1 })))
  }
  const answers = await Promise.all(
    groups.map((group) =>
      askGemini(geminiKey, model, system, [{ text: buildUserPrompt(contentBrief, group, avoid) }], {
        temperature: 0.9,
        maxOutputTokens: 8192,
      }),
    ),
  )
  const rows: PlanRow[] = []
  let failure = ''
  answers.forEach((asked, index) => {
    if (!asked.ok) {
      failure = asked.error
      return
    }
    const parsed = parsePlan(asked.answer, groups[index], kind)
    if (!parsed) {
      failure = 'The AI gave an answer that could not be used. Try again.'
      return
    }
    rows.push(...parsed)
  })
  if (rows.length === 0) {
    await logUsage({ ok: false, units: 0, error: failure || 'No rows came back' })
    return jsonResponse({ ok: false, error: failure || 'The AI gave an answer that could not be used. Try again.' }, 502)
  }

  const firstOrder = existingRows.reduce((max, row) => Math.max(max, row.sort_order ?? 0), 0) + 10
  const { data: inserted, error: insertError } = await admin
    .from('content_items')
    .insert(
      rows.map((row, index) => ({
        brief_id: request.briefId,
        style_id: row.styleId,
        angle_id: row.angleId,
        size: row.size,
        kind,
        pages: kind === 'carousel' ? contentBrief.carouselPages : 1,
        headline: row.headline,
        subheadline: row.subheadline,
        poster_text: row.posterText,
        caption: addMustInclude(row.caption, settings.mustInclude).slice(0, 4000),
        visual: row.visual,
        sort_order: firstOrder + index * 10,
      })),
    )
    .select('id')
  if (insertError) {
    console.error('Could not save the plan', insertError.message)
    await logUsage({ ok: false, units: 0, error: `Save failed: ${insertError.message}` })
    return jsonResponse({ ok: false, error: 'The plan could not be saved. Try again.' }, 500)
  }
  await logUsage({ ok: true, units: rows.length })
  return jsonResponse(
    {
      ok: true,
      added: inserted?.length ?? rows.length,
      // Some parts failed: say so, the rest is kept.
      warning: failure && rows.length < slots.length ? `Only ${rows.length} of ${slots.length} rows came back.` : undefined,
    },
    200,
  )
})
