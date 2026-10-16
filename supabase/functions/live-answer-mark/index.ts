// AI suggestions for the answers in class that wait for the teacher.
//
// The lesson's teacher asks for one popped question. Its short answers and
// screenshots that are still waiting (and not looked at yet) go to Google
// Gemini with the question, the accepted answers and the explanation; no name
// or other detail of the child is sent. Each suggestion (right / wrong /
// unsure, a line for the child, a line for the teacher) is saved on the
// answer. It never marks: the teacher accepts or changes it, and only then do
// points move. Links are left to the teacher (the AI cannot open them).
//
// Secrets (set in Supabase, never in the browser):
//   GEMINI_API_KEY        required (the same one the AI analysis uses)
//   GEMINI_MODEL          optional, default gemini-3.5-flash-lite
//   AI_MARK_DAILY_CAP     optional, most answers checked per day for the school, default 500
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { buildMarkRequest, buildMarkSystemPrompt, parseMark, type MarkKind } from './logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const BATCH_LIMIT = 30
const PARALLEL = 4

type AnswerRow = { id: number; answer_text: string | null; file_path: string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  if (!geminiKey) return jsonResponse({ ok: false, error: 'The AI key has not been set up yet.' }, 503)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)

  let body: { liveQuestionId?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const liveQuestionId = Number(body.liveQuestionId)
  if (!Number.isInteger(liveQuestionId) || liveQuestionId <= 0) {
    return jsonResponse({ ok: false, error: 'Say which question.' }, 400)
  }

  // Everything below is read as the caller, so the database decides what they may see.
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: question } = await caller
    .from('live_questions')
    .select('id, session_id, kind, prompt')
    .eq('id', liveQuestionId)
    .maybeSingle()
  if (!question) return jsonResponse({ ok: false, error: 'Question not found.' }, 404)
  const { data: mayRun } = await caller.rpc('can_run_class_session', { p_session_id: question.session_id })
  if (mayRun !== true) return jsonResponse({ ok: false, error: 'Only this class\'s teacher can ask the AI.' }, 403)
  if (question.kind !== 'short' && question.kind !== 'screenshot') {
    return jsonResponse({ ok: true, checked: 0, failed: 0 }, 200)
  }

  const { data: settingsRow } = await caller.from('app_settings').select('value').eq('key', 'live_questions').maybeSingle()
  if ((settingsRow?.value as { ai_marking?: unknown } | undefined)?.ai_marking === false) {
    return jsonResponse({ ok: false, error: 'AI marking is switched off in Class Settings.' }, 409)
  }

  const [{ data: key }, { data: answers }, { data: session }] = await Promise.all([
    caller.from('live_question_keys').select('accepted_answers, explanation').eq('live_question_id', liveQuestionId).maybeSingle(),
    caller
      .from('live_answers')
      .select('id, answer_text, file_path')
      .eq('live_question_id', liveQuestionId)
      .eq('result', 'pending')
      .is('ai_checked_at', null)
      .order('id')
      .limit(BATCH_LIMIT),
    caller.from('class_sessions').select('classroom_id').eq('id', question.session_id).maybeSingle(),
  ])
  const waiting = (answers ?? []) as AnswerRow[]
  if (waiting.length === 0) return jsonResponse({ ok: true, checked: 0, failed: 0 }, 200)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const cap = Number(Deno.env.get('AI_MARK_DAILY_CAP') ?? '500')
  const { count } = await admin
    .from('live_answers')
    .select('id', { count: 'exact', head: true })
    .gte('ai_checked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  const left = (Number.isFinite(cap) && cap > 0 ? cap : 500) - (count ?? 0)
  if (left <= 0) return jsonResponse({ ok: false, error: 'The AI marking limit for today has been reached.' }, 429)

  const { data: classroom } = session?.classroom_id
    ? await caller.from('classrooms').select('age_group').eq('id', session.classroom_id).maybeSingle()
    : { data: null }
  const accepted = Array.isArray(key?.accepted_answers)
    ? (key.accepted_answers as { text?: unknown }[]).flatMap((entry) => (typeof entry?.text === 'string' ? [entry.text] : []))
    : []
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  const systemPrompt = buildMarkSystemPrompt()

  async function checkOne(answer: AnswerRow): Promise<boolean> {
    const parts: unknown[] = [
      {
        text: buildMarkRequest({
          kind: question!.kind as MarkKind,
          prompt: question!.prompt,
          accepted,
          guidance: key?.explanation ?? null,
          answer: answer.answer_text,
          ageGroup: classroom?.age_group ?? null,
        }),
      },
    ]
    if (question!.kind === 'screenshot') {
      if (!answer.file_path) return false
      const { data: file, error } = await admin.storage.from('live-answers').download(answer.file_path)
      if (error || !file) {
        console.error('Could not read the picture', answer.id, error?.message)
        return false
      }
      parts.push({ inline_data: { mime_type: file.type || 'image/jpeg', data: encodeBase64(new Uint8Array(await file.arrayBuffer())) } })
    }

    for (const [attempt, timeout] of [25000, 35000].entries()) {
      const last = attempt === 1
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey! },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: 'application/json' },
            }),
            signal: AbortSignal.timeout(timeout),
          },
        )
        if (!response.ok) {
          console.error('Gemini error', response.status, (await response.text()).slice(0, 300).split(geminiKey!).join('***'))
          if (!last && [429, 500, 502, 503, 504].includes(response.status)) continue
          return false
        }
        const data = await response.json()
        const replyParts = data?.candidates?.[0]?.content?.parts
        const text = Array.isArray(replyParts)
          ? replyParts
              .filter((part: { thought?: boolean }) => part && part.thought !== true)
              .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
              .join('')
          : ''
        const mark = parseMark(text)
        if (!mark) return false
        const { error } = await admin.rpc('apply_live_ai_mark', {
          p_answer_id: answer.id,
          p_suggestion: mark.suggestion,
          p_feedback: mark.feedback,
          p_note: mark.note,
        })
        if (error) {
          console.error('Could not save the suggestion', answer.id, error.message)
          return false
        }
        return true
      } catch (problem) {
        console.error('Gemini request failed', problem instanceof Error ? problem.message : problem)
        if (!last) continue
        return false
      }
    }
    return false
  }

  const queue = waiting.slice(0, left)
  let checked = 0
  let failed = 0
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        if (await checkOne(next)) checked += 1
        else failed += 1
      }
    }),
  )

  return jsonResponse({ ok: true, checked, failed }, 200)
})
