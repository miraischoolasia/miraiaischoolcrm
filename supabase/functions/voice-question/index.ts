// The teacher speaks a question (up to a minute) and gets a draft back in the
// question form. It is only a draft: the teacher reads it, changes anything,
// and saves it themselves; nothing reaches the children from here.
//
// POST { mime, audio (base64), ageGroup? }  (staff only)
//
// Secrets (set in Supabase, never in the browser):
//   GEMINI_API_KEY        required (the same one the AI marking uses)
//   GEMINI_MODEL          optional, default gemini-3.5-flash-lite
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { MAX_AUDIO_BASE64, VOICE_SCHEMA, buildVoiceSystemPrompt, isAudioMime, parseVoiceDraft } from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !anonKey) return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  if (!geminiKey) return jsonResponse({ ok: false, error: 'Speaking a question is not set up yet (no AI key).' }, 503)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)

  let body: { mime?: unknown; audio?: unknown; ageGroup?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  if (!isAudioMime(body.mime) || typeof body.audio !== 'string' || body.audio.length === 0) {
    return jsonResponse({ ok: false, error: 'That does not look like a recording.' }, 400)
  }
  if (body.audio.length > MAX_AUDIO_BASE64) {
    return jsonResponse({ ok: false, error: 'That recording is too long. Please keep it under a minute.' }, 413)
  }

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: teacherId } = await caller.rpc('current_teacher_id')
  if (!teacherId) return jsonResponse({ ok: false, error: 'Only staff can write questions.' }, 403)

  const ageGroup = typeof body.ageGroup === 'string' ? body.ageGroup.slice(0, 40) : null
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  for (const [attempt, timeout] of [25000, 35000].entries()) {
    const last = attempt === 1
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildVoiceSystemPrompt(ageGroup) }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Write the question the teacher is asking.' },
                { inline_data: { mime_type: String(body.mime).split(';')[0], data: body.audio } },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: VOICE_SCHEMA },
        }),
        signal: AbortSignal.timeout(timeout),
      })
      if (!response.ok) {
        console.error('Gemini error', response.status, (await response.text()).slice(0, 300).split(geminiKey).join('***'))
        if (!last && [429, 500, 502, 503, 504].includes(response.status)) continue
        return jsonResponse({ ok: false, error: 'Could not turn that into a question. Please try again.' }, 502)
      }
      const data = await response.json()
      const parts = data?.candidates?.[0]?.content?.parts
      const text = Array.isArray(parts)
        ? parts
            .filter((part: { thought?: boolean }) => part && part.thought !== true)
            .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
            .join('')
        : ''
      const draft = parseVoiceDraft(text)
      if (!draft) return jsonResponse({ ok: false, error: 'Could not understand that. Please try again.' }, 502)
      return jsonResponse({ ok: true, draft }, 200)
    } catch (problem) {
      console.error('Gemini failed', problem instanceof Error ? problem.name : 'unknown')
      if (!last) continue
      return jsonResponse({ ok: false, error: 'The AI took too long. Please try again.' }, 504)
    }
  }
  return jsonResponse({ ok: false, error: 'Could not turn that into a question. Please try again.' }, 502)
})
