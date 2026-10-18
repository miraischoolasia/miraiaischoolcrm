// The live class console's AI assistant (staff only). It never acts: it
// returns suggestions that the teacher confirms one by one in the console.
//
// POST { mode: 'command', text? | audio? + mime?, context: { roster, presets, bank, ageGroup } }
//   -> { ok, reply, actions }
// POST { mode: 'image', image (base64), mime, want: 'notes' | 'questions' | 'both', howMany?, instruction?, ageGroup? }
//   -> { ok, notes, questions }
//
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  MAX_AUDIO_BASE64,
  MAX_IMAGE_BASE64,
  buildCommandPrompt,
  buildImagePrompt,
  parseCommand,
  parseImageResult,
  type CommandContext,
} from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

async function askGemini(key: string, system: string, parts: unknown[]): Promise<{ text: string | null; error: string | null }> {
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  for (const [attempt, timeout] of [30000, 40000].entries()) {
    const last = attempt === 1
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(timeout),
      })
      if (!response.ok) {
        console.error('Gemini error', response.status, (await response.text()).slice(0, 300).split(key).join('***'))
        if (!last && [429, 500, 502, 503, 504].includes(response.status)) continue
        return { text: null, error: 'The AI could not answer. Please try again.' }
      }
      const data = await response.json()
      const replyParts = data?.candidates?.[0]?.content?.parts
      const text = Array.isArray(replyParts)
        ? replyParts
            .filter((part: { thought?: boolean }) => part && part.thought !== true)
            .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
            .join('')
        : ''
      return { text, error: null }
    } catch (problem) {
      console.error('Gemini failed', problem instanceof Error ? problem.name : 'unknown')
      if (!last) continue
      return { text: null, error: 'The AI took too long. Please try again.' }
    }
  }
  return { text: null, error: 'The AI could not answer. Please try again.' }
}

const list = <T>(value: unknown, max: number) => (Array.isArray(value) ? (value.slice(0, max) as T[]) : [])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !anonKey) return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  if (!geminiKey) return jsonResponse({ ok: false, error: 'The AI assistant is not set up yet (no AI key).' }, 503)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: teacherId } = await caller.rpc('current_teacher_id')
  if (!teacherId) return jsonResponse({ ok: false, error: 'Only staff can use the assistant.' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const ageGroup = typeof body.ageGroup === 'string' ? body.ageGroup.slice(0, 40) : null

  if (body.mode === 'image') {
    const mime = typeof body.mime === 'string' && /^image\/(png|jpe?g|webp|heic|heif)$/i.test(body.mime) ? body.mime : null
    if (!mime || typeof body.image !== 'string' || body.image.length === 0) return jsonResponse({ ok: false, error: 'Send a photo (PNG, JPG or WebP).' }, 400)
    if (body.image.length > MAX_IMAGE_BASE64) return jsonResponse({ ok: false, error: 'That photo is too big. Please send a smaller one.' }, 413)
    const want = body.want === 'notes' || body.want === 'questions' ? body.want : 'both'
    const howMany = Math.min(8, Math.max(1, Math.round(Number(body.howMany) || 3)))
    const instruction = typeof body.instruction === 'string' ? body.instruction : null
    const result = await askGemini(geminiKey, buildImagePrompt({ want, ageGroup, instruction, howMany }), [
      { text: 'Make the notes and questions from this photo.' },
      { inline_data: { mime_type: mime, data: body.image } },
    ])
    if (result.error || result.text === null) return jsonResponse({ ok: false, error: result.error }, 502)
    const parsed = parseImageResult(result.text)
    if (!parsed) return jsonResponse({ ok: false, error: 'Could not read the AI’s answer. Please try again.' }, 502)
    return jsonResponse({ ok: true, ...parsed }, 200)
  }

  // A spoken or typed request.
  const raw = (body.context ?? {}) as Record<string, unknown>
  const context: CommandContext = {
    roster: list<{ id: number; name: string }>(raw.roster, 400).filter((person) => Number.isInteger(person?.id) && typeof person?.name === 'string'),
    presets: list<{ id: number; label: string; points: number }>(raw.presets, 20).filter((preset) => Number.isInteger(preset?.id)),
    bank: list<{ id: number; prompt: string }>(raw.bank, 80).filter((question) => Number.isInteger(question?.id)),
    ageGroup,
  }
  const parts: unknown[] = []
  if (typeof body.text === 'string' && body.text.trim()) {
    parts.push({ text: body.text.trim().slice(0, 1000) })
  } else if (typeof body.audio === 'string' && body.audio.length > 0 && typeof body.mime === 'string' && /^audio\//i.test(body.mime)) {
    if (body.audio.length > MAX_AUDIO_BASE64) return jsonResponse({ ok: false, error: 'That recording is too long.' }, 413)
    parts.push({ text: 'The teacher said this:' }, { inline_data: { mime_type: body.mime.split(';')[0], data: body.audio } })
  } else {
    return jsonResponse({ ok: false, error: 'Say or type what to do.' }, 400)
  }
  const result = await askGemini(geminiKey, buildCommandPrompt(context), parts)
  if (result.error || result.text === null) return jsonResponse({ ok: false, error: result.error }, 502)
  const parsed = parseCommand(result.text, context)
  if (!parsed) return jsonResponse({ ok: false, error: 'Could not read the AI’s answer. Please try again.' }, 502)
  return jsonResponse({ ok: true, ...parsed }, 200)
})
