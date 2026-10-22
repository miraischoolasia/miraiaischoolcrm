// Content Studio's picture drawing (phase 2).
//
// POST { mode: 'work' }   draws the pictures waiting in content_images, a few at a time, in the background,
//                         and answers at once. When time runs out with pictures still waiting, it calls itself
//                         again, so the queue empties even when nobody has the page open.
//
// Pictures are queued by the database (content_queue_images / content_edit_image, which check the
// permission and the daily picture limit); the page calls this function right after, and again now and
// then while pictures are waiting. The caller is a signed-in person who may edit Content Studio, or this
// function itself (service key).
//
// Secrets (set in Supabase, never in the browser):
//   CONTENT_IMAGE_API_KEY   the Gemini key for pictures (a paid key: free keys cannot use the picture models);
//                           when it is not set, GEMINI_API_KEY is used. Post ideas and AI drafts keep GEMINI_API_KEY.
//   CONTENT_IMAGE_MODEL     optional, drafts, default gemini-2.5-flash-image
//   CONTENT_IMAGE_HD_MODEL  optional, high quality, default gemini-3-pro-image-preview
//   SCHOOL_NAME             optional, when the Brand page has no name
//   GEMINI_API_BASE         optional, only for the local test (a stand-in for Google)
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64'
import { aspectRatioOf, buildDrawPrompt, imageKeyFrom, imagePath, noPictureIsWorthRetrying, noPictureReason, pictureOf, type DrawItem } from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

const DRAFT_MODEL = 'gemini-2.5-flash-image'
const HD_MODEL = 'gemini-3-pro-image-preview'
const DEFAULT_SCHOOL_NAME = 'Mirai AI School'
// Pictures drawn at the same time. A run only starts pictures in its first seconds, then hands the rest to a
// fresh run, so a slow picture (Gemini can take over a minute) never runs past the function's time limit
// (150 s on the free plan) and gets cut off half way.
const WORKERS = 3
const START_NEW_FOR_MS = 10_000
// How long one picture may take before it is tried again.
const DRAW_TIMEOUT_MS = 125_000
// After a failed try, wait this long before the next run picks the picture up again.
const RETRY_PAUSE_MS = 15_000
const MAX_SAMPLES = 3

type Part = { text: string } | { inline_data: { mime_type: string; data: string } }

type JobRow = {
  id: number
  item_id: number
  page: number
  quality: 'draft' | 'hd'
  instruction: string
  parent_id: number | null
  attempts: number
}

function keyFree(text: string, key: string) {
  return text.split(key).join('***')
}

async function drawWithGemini(
  key: string,
  model: string,
  parts: Part[],
  aspectRatio: string,
  hd: boolean,
): Promise<{ ok: true; mime: string; base64: string } | { ok: false; error: string; retry: boolean }> {
  const base = (Deno.env.get('GEMINI_API_BASE') || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
  try {
    const response = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          // Text and image: with image only, Gemini sometimes ends with NO_IMAGE instead of drawing.
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: hd ? { aspectRatio, imageSize: '2K' } : { aspectRatio },
        },
      }),
      signal: AbortSignal.timeout(DRAW_TIMEOUT_MS),
    })
    if (!response.ok) {
      const body = (await response.text()).slice(0, 400)
      let message = body
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } }
        message = [parsed?.error?.status, parsed?.error?.message].filter(Boolean).join(' - ') || body
      } catch {
        // not JSON
      }
      return {
        ok: false,
        error: keyFree(`Gemini ${response.status}: ${message}`, key).replace(/\s+/g, ' ').slice(0, 240),
        retry: [429, 500, 502, 503, 504].includes(response.status),
      }
    }
    const data = await response.json()
    const picture = pictureOf(data)
    if (!picture) return { ok: false, error: noPictureReason(data).slice(0, 280), retry: noPictureIsWorthRetrying(data) }
    return { ok: true, ...picture }
  } catch (problem) {
    const reason = problem instanceof Error ? `${problem.name}: ${problem.message}` : 'unknown'
    return { ok: false, error: keyFree(`The picture AI did not answer (${reason})`, key).slice(0, 240), retry: true }
  }
}

async function fileAsPart(admin: SupabaseClient, path: string): Promise<Part | null> {
  const { data } = await admin.storage.from('content-files').download(path)
  if (!data) return null
  return { inline_data: { mime_type: data.type || 'image/png', data: encodeBase64(new Uint8Array(await data.arrayBuffer())) } }
}

async function urlAsPart(url: string): Promise<Part | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!type.startsWith('image/') || type.includes('svg')) return null
    return { inline_data: { mime_type: type.split(';')[0], data: encodeBase64(new Uint8Array(await response.arrayBuffer())) } }
  } catch {
    return null
  }
}

async function drawOne(admin: SupabaseClient, key: string, job: JobRow) {
  const startedAt = Date.now()
  const fail = async (error: string, retry: boolean) => {
    const again = retry && job.attempts < 3
    await admin
      .from('content_images')
      .update({ status: again ? 'queued' : 'failed', error: error.slice(0, 300), finished_at: again ? null : new Date().toISOString() })
      .eq('id', job.id)
    await admin.from('content_ai_usage').insert({
      brief_id: null,
      action: 'image',
      provider: 'gemini',
      model: job.quality === 'hd' ? Deno.env.get('CONTENT_IMAGE_HD_MODEL') || HD_MODEL : Deno.env.get('CONTENT_IMAGE_MODEL') || DRAFT_MODEL,
      units: 0,
      ok: false,
      error: error.slice(0, 300),
      latency_ms: Date.now() - startedAt,
    })
    return false
  }

  const { data: item } = await admin.from('content_items').select('*').eq('id', job.item_id).maybeSingle()
  if (!item) return fail('The post was removed.', false)
  const [{ data: style }, { data: branding }, { data: settings }] = await Promise.all([
    item.style_id
      ? admin.from('content_styles').select('name, description, reference_paths').eq('id', item.style_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('app_settings').select('value').eq('key', 'crm_branding').maybeSingle(),
    admin.from('content_studio_settings').select('image_provider').eq('id', 1).maybeSingle(),
  ])
  if (settings?.image_provider === 'openai') return fail('Drawing with OpenAI is not connected yet.', false)

  const parts: Part[] = []
  // The picture being changed or redrawn.
  let parentPart: Part | null = null
  if (job.parent_id) {
    const { data: parent } = await admin.from('content_images').select('path').eq('id', job.parent_id).maybeSingle()
    if (parent?.path) parentPart = await fileAsPart(admin, parent.path)
  }
  // A carousel's later pages follow page 1.
  let firstPagePart: Part | null = null
  if (!parentPart && item.kind === 'carousel' && job.page > 1) {
    const { data: first } = await admin
      .from('content_images')
      .select('path')
      .eq('item_id', job.item_id)
      .eq('page', 1)
      .eq('status', 'done')
      .order('chosen', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (first?.path) firstPagePart = await fileAsPart(admin, first.path)
  }
  const samples: Part[] = []
  if (!parentPart) {
    const paths = Array.isArray(style?.reference_paths) ? (style.reference_paths as string[]).slice(-MAX_SAMPLES) : []
    for (const path of paths) {
      const part = await fileAsPart(admin, path)
      if (part) samples.push(part)
    }
  }
  const value = (branding?.value ?? {}) as { name?: string; primary?: string; logo_url?: string }
  const logoPart = !parentPart && value.logo_url ? await urlAsPart(value.logo_url) : null

  const drawItem: DrawItem = {
    kind: item.kind,
    pages: item.pages,
    size: item.size,
    headline: item.headline,
    subheadline: item.subheadline,
    posterText: item.poster_text,
    visual: item.visual,
  }
  const prompt = buildDrawPrompt(drawItem, { page: job.page, quality: job.quality, instruction: job.instruction, parentId: job.parent_id }, {
    schoolName: value.name?.trim() || Deno.env.get('SCHOOL_NAME')?.trim() || DEFAULT_SCHOOL_NAME,
    brandColour: value.primary?.trim() || '',
    styleName: style?.name ?? '',
    styleDescription: style?.description ?? '',
    hasParent: Boolean(parentPart),
    hasFirstPage: Boolean(firstPagePart),
    sampleCount: samples.length,
    hasLogo: Boolean(logoPart),
  })
  parts.push({ text: prompt })
  if (parentPart) parts.push(parentPart)
  if (firstPagePart) parts.push(firstPagePart)
  parts.push(...samples)
  if (logoPart) parts.push(logoPart)

  const hd = job.quality === 'hd'
  const model = hd ? Deno.env.get('CONTENT_IMAGE_HD_MODEL') || HD_MODEL : Deno.env.get('CONTENT_IMAGE_MODEL') || DRAFT_MODEL
  const drawn = await drawWithGemini(key, model, parts, aspectRatioOf(item.size), hd)
  console.log(`picture ${job.id} try ${job.attempts} ${model} ${Date.now() - startedAt}ms ${drawn.ok ? 'drawn' : `failed: ${drawn.error.slice(0, 120)}`}`)
  if (!drawn.ok) return fail(drawn.error, drawn.retry)

  const path = imagePath(job.item_id, job.id, drawn.mime)
  const { error: uploadError } = await admin.storage
    .from('content-files')
    .upload(path, decodeBase64(drawn.base64), { contentType: drawn.mime, upsert: true })
  if (uploadError) return fail(`The picture could not be saved: ${uploadError.message}`, true)

  await admin
    .from('content_images')
    .update({ status: 'done', path, model, error: null, finished_at: new Date().toISOString() })
    .eq('id', job.id)
  await admin.from('content_ai_usage').insert({
    brief_id: item.brief_id,
    action: 'image',
    provider: 'gemini',
    model,
    units: 1,
    ok: true,
    latency_ms: Date.now() - startedAt,
  })
  return true
}

// Takes waiting pictures one after another until none are left or time is up; WORKERS of these run at once.
async function work(admin: SupabaseClient, key: string, until: number): Promise<boolean> {
  let allDrawn = true
  while (Date.now() < until) {
    const { data, error } = await admin.rpc('content_claim_image_job')
    const job = data as JobRow | null
    if (error || !job || !job.id) return allDrawn
    try {
      if ((await drawOne(admin, key, job)) === false) allDrawn = false
    } catch (problem) {
      allDrawn = false
      console.error('Drawing failed', problem instanceof Error ? problem.message : problem)
      await admin.from('content_images').update({ status: 'queued' }).eq('id', job.id).eq('status', 'working')
    }
  }
  return allDrawn
}

async function runQueue(admin: SupabaseClient, key: string, supabaseUrl: string, serviceRoleKey: string) {
  const until = Date.now() + START_NEW_FOR_MS
  const results = await Promise.all(Array.from({ length: WORKERS }, () => work(admin, key, until)))
  // Pictures still waiting: hand over to a fresh run of this function (after a short pause when a try just
  // failed, so a busy Gemini gets a moment before the next try).
  const { count } = await admin.from('content_images').select('id', { count: 'exact', head: true }).eq('status', 'queued')
  if ((count ?? 0) > 0) {
    if (results.includes(false)) await new Promise((resume) => setTimeout(resume, RETRY_PAUSE_MS))
    await fetch(`${supabaseUrl}/functions/v1/content-images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'work' }),
    }).catch((problem) => console.error('Could not hand over', problem instanceof Error ? problem.message : problem))
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  const geminiKey = imageKeyFrom((name) => Deno.env.get(name))
  if (!geminiKey) return jsonResponse({ ok: false, error: 'The AI key has not been set up yet.' }, 503)

  const authHeader = req.headers.get('Authorization') ?? ''
  const fromItself = authHeader === `Bearer ${serviceRoleKey}`
  if (!fromItself) {
    if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: allowed, error } = await caller.rpc('has_permission', { p_module: 'content_studio', p_action: 'edit' })
    if (error || allowed !== true) return jsonResponse({ ok: false, error: 'You do not have permission to draw pictures.' }, 403)
  }

  let body: { mode?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // an empty body means "work"
  }
  if (body.mode !== undefined && body.mode !== 'work') return jsonResponse({ ok: false, error: 'Invalid request.' }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const running = runQueue(admin, geminiKey, supabaseUrl, serviceRoleKey)
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime) {
    runtime.waitUntil(running)
  } else {
    await running
  }
  return jsonResponse({ ok: true }, 202)
})
