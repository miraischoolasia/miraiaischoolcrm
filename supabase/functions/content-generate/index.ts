// Content Studio's AI (Marketing > Content Studio).
//
// POST { mode: 'plan', briefId }               the brief's first plan: item_count rows
// POST { mode: 'more', briefId, count, kind }  more rows of one type, different from the ones already there
// POST { mode: 'read_pdf', briefId, path }     the words in one of the brief's PDFs (returned, not saved)
// POST { mode: 'analyze', briefId }            the AI reads all the campaign's files and pasted text and
//                                              fills in its details (saved on the campaign and returned)
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
  ANALYZE_SYSTEM_PROMPT,
  CONTENT_SIZES,
  MAX_PDF_BYTES,
  PDF_SYSTEM_PROMPT,
  addMustInclude,
  buildAnalyzePrompt,
  buildSlots,
  buildSystemPrompt,
  buildUserPrompt,
  kindsFor,
  malaysiaDayStart,
  parseAnalysis,
  parsePdfText,
  parsePlan,
  validateRequest,
  type ContentAngle,
  type ContentBrief,
  type ContentKind,
  type ContentSize,
  type KindCounts,
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
// Rows asked for in one question; a bigger plan is asked in parts, a few at the same time.
const ROWS_PER_QUESTION = 6
const QUESTIONS_AT_ONCE = 4
// All the files of one campaign the AI reads at once.
const MAX_MATERIAL_BYTES = 18 * 1024 * 1024

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
    return jsonResponse({ ok: false, error: 'This campaign already has post ideas. Use "More ideas" to add some.' }, 409)
  }

  // How many of each type: the campaign's counts, or (a phase-1 campaign) item_count of its one kind.
  const legacyKind: ContentKind = brief.kind === 'carousel' || brief.kind === 'caption' ? brief.kind : 'single'
  const savedCounts: KindCounts = {
    single: Number(brief.single_count) || 0,
    carousel: Number(brief.carousel_count) || 0,
    caption: Number(brief.caption_count) || 0,
  }
  const counts: KindCounts =
    savedCounts.single + savedCounts.carousel + savedCounts.caption > 0
      ? savedCounts
      : { single: 0, carousel: 0, caption: 0, [legacyKind]: Number(brief.item_count) || 1 }
  const kinds: ContentKind[] =
    request.mode === 'plan'
      ? kindsFor(counts)
      : request.mode === 'more'
        ? Array.from({ length: request.count }, () => request.kind)
        : []
  if (request.mode === 'plan' && kinds.length === 0) {
    return jsonResponse({ ok: false, error: 'Say how many posts of each type to make first.' }, 400)
  }

  const units = request.mode === 'plan' || request.mode === 'more' ? kinds.length : 1
  const { data: usedRows } = await admin
    .from('content_ai_usage')
    .select('units')
    .eq('ok', true)
    .neq('action', 'image')
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

  // ---- Reading all the campaign's material -------------------------------------------------------------
  if (request.mode === 'analyze') {
    const files = (Array.isArray(brief.files) ? brief.files : []) as { path?: unknown; name?: unknown; type?: unknown }[]
    const readable = files.filter(
      (file): file is { path: string; name: string; type: string } =>
        typeof file.path === 'string' &&
        file.path.startsWith(`briefs/${request.briefId}/`) &&
        typeof file.type === 'string' &&
        ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type),
    )
    const sourceText = String(brief.source_text ?? '')
    if (readable.length === 0 && !sourceText.trim()) {
      return jsonResponse({ ok: false, error: 'Add a file or some text first.' }, 400)
    }
    const parts: Part[] = []
    let total = 0
    for (const file of readable) {
      const { data: blob } = await admin.storage.from('content-files').download(file.path)
      if (!blob) continue
      total += blob.size
      if (total > MAX_MATERIAL_BYTES) {
        return jsonResponse(
          { ok: false, error: 'The files are too big to read together (18 MB at most). Remove one and try again.' },
          413,
        )
      }
      parts.push({ inline_data: { mime_type: file.type, data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) } })
    }
    parts.push({ text: buildAnalyzePrompt(sourceText, readable.map((file) => String(file.name ?? ''))) })
    const asked = await askGemini(geminiKey, model, ANALYZE_SYSTEM_PROMPT, parts, { temperature: 0.1, maxOutputTokens: 8192 })
    if (!asked.ok) {
      await logUsage({ ok: false, units: 0, error: asked.error })
      return jsonResponse({ ok: false, error: asked.error }, 502)
    }
    const found = parseAnalysis(asked.answer)
    if (!found) {
      await logUsage({ ok: false, units: 0, error: 'Nothing could be read' })
      return jsonResponse(
        { ok: false, error: 'The AI could not read the material. Try clearer files, or type the details yourself.' },
        502,
      )
    }
    const { error: saveError } = await admin
      .from('content_briefs')
      .update({
        topic: found.topic,
        key_points: found.keyPoints,
        audience: found.audience,
        call_to_action: found.callToAction,
        pdf_text: found.allText,
      })
      .eq('id', request.briefId)
    if (saveError) console.error('Could not save what was read', saveError.message)
    await logUsage({ ok: true, units: 1 })
    return jsonResponse({ ok: true, analysis: found }, 200)
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

  const sizes = asSizes(brief.sizes)
  const contentBrief: ContentBrief = {
    title: String(brief.title ?? ''),
    topic: String(brief.topic ?? ''),
    keyPoints: String(brief.key_points ?? ''),
    audience: String(brief.audience ?? ''),
    callToAction: String(brief.call_to_action ?? ''),
    pdfText: String(brief.pdf_text ?? ''),
    sizes,
    carouselPages: Number(brief.carousel_pages) || 5,
  }
  const brandName = typeof branding?.value?.name === 'string' ? branding.value.name.trim() : ''
  const schoolName = brandName || Deno.env.get('SCHOOL_NAME')?.trim() || DEFAULT_SCHOOL_NAME
  const system = buildSystemPrompt(settings, schoolName)

  const slots = buildSlots(styles, angles, sizes, kinds, existingRows.length)
  const avoid = existingRows.map((row) => row.headline).filter(Boolean)
  const groups: (typeof slots)[] = []
  for (let at = 0; at < slots.length; at += ROWS_PER_QUESTION) {
    // Each question numbers its rows from 1.
    groups.push(slots.slice(at, at + ROWS_PER_QUESTION).map((slot, index) => ({ ...slot, slot: index + 1 })))
  }
  // A few questions at a time, so a big plan does not hit Google's per-minute limit all at once.
  const answers: Awaited<ReturnType<typeof askGemini>>[] = []
  for (let at = 0; at < groups.length; at += QUESTIONS_AT_ONCE) {
    answers.push(
      ...(await Promise.all(
        groups.slice(at, at + QUESTIONS_AT_ONCE).map((group) =>
          askGemini(geminiKey, model, system, [{ text: buildUserPrompt(contentBrief, group, avoid) }], {
            temperature: 0.9,
            maxOutputTokens: 8192,
          }),
        ),
      )),
    )
  }
  const rows: PlanRow[] = []
  let failure = ''
  answers.forEach((asked, index) => {
    if (!asked.ok) {
      failure = asked.error
      return
    }
    const parsed = parsePlan(asked.answer, groups[index])
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
        kind: row.kind,
        pages: row.kind === 'carousel' ? contentBrief.carouselPages : 1,
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
