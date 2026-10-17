// AI analysis of one student, for the teacher or for the parent.
//
// A signed-in staff member asks for a student they can see. The facts are read
// with the caller's own login (so the database's rules decide what they may
// use): the latest lessons' attendance, the teacher's ratings and notes, and
// reward points, limited to the sources the school switched on
// (app_settings 'ai_student_report'). Only the first name and age go to
// Google Gemini, never the full name, phone or parents. The answer is saved
// in student_ai_reports and returned; nothing is sent to anyone from here.
//
// Secrets (set in Supabase, never in the browser):
//   GEMINI_API_KEY         required (the same one the AI reply drafts use)
//   GEMINI_MODEL           optional, default gemini-3.5-flash-lite
//   AI_REPORT_DAILY_CAP    optional, most analyses per day for the school, default 100
//   SCHOOL_NAME            optional, the school's name in the instructions (default: "the school")
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  buildFacts,
  buildSystemPrompt,
  firstNameOf,
  parseReport,
  readSettings,
  type Audience,
  type LessonFact,
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
const LESSON_LIMIT = 24

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

  let body: { studentId?: unknown; audience?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const studentId = Number(body.studentId)
  const audience: Audience | null = body.audience === 'teacher' || body.audience === 'parent' ? body.audience : null
  if (!Number.isInteger(studentId) || studentId <= 0 || !audience) {
    return jsonResponse({ ok: false, error: 'Say which student and for whom.' }, 400)
  }

  // Everything below is read as the caller.
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: teacherId } = await caller.rpc('current_teacher_id')
  if (!teacherId) return jsonResponse({ ok: false, error: 'Only staff can ask for an analysis.' }, 403)

  const { data: student } = await caller
    .from('students')
    .select('id, full_name, age, classroom_id')
    .eq('id', studentId)
    .maybeSingle()
  if (!student) return jsonResponse({ ok: false, error: 'Student not found.' }, 404)

  // When the school asks parents first (Class Settings > Student app), no yes means no analysis.
  const { data: consentRow } = await caller.from('app_settings').select('value').eq('key', 'portal_consents').maybeSingle()
  if ((consentRow?.value as { ai_analysis?: { required?: unknown } } | undefined)?.ai_analysis?.required === true) {
    const { data: agreed } = await caller.rpc('student_has_consent', { p_student_id: studentId, p_kind: 'ai_analysis' })
    if (agreed !== true) {
      return jsonResponse({ ok: false, error: 'The parent has not agreed to AI reports yet (they answer in the student app).' }, 403)
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const cap = Number(Deno.env.get('AI_REPORT_DAILY_CAP') ?? '100')
  const { count } = await admin
    .from('student_ai_reports')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  if ((count ?? 0) >= (Number.isFinite(cap) && cap > 0 ? cap : 100)) {
    return jsonResponse({ ok: false, error: 'The AI analysis limit for today has been reached.' }, 429)
  }

  const [{ data: settingsRow }, { data: classroom }, { data: statusRows }, { data: criteriaRows }, { data: attendanceRows }] =
    await Promise.all([
      caller.from('app_settings').select('value').eq('key', 'ai_student_report').maybeSingle(),
      student.classroom_id
        ? caller.from('classrooms').select('name').eq('id', student.classroom_id).maybeSingle()
        : Promise.resolve({ data: null }),
      caller.from('attendance_statuses').select('key, label, attended'),
      caller.from('review_criteria').select('id, name, max_score'),
      caller.from('lesson_log_students').select('lesson_log_id, attendance_status').eq('student_id', studentId),
    ])
  const settings = readSettings(settingsRow?.value)

  // Latest revision of each lesson this student was in, newest LESSON_LIMIT.
  const logIds = (attendanceRows ?? []).map((row: { lesson_log_id: number }) => row.lesson_log_id)
  const { data: logRows } = logIds.length
    ? await caller.from('lesson_logs').select('id, schedule_id, lesson_date, revision_number').in('id', logIds)
    : { data: [] }
  const latest = new Map<string, { id: number; lesson_date: string; revision_number: number }>()
  for (const log of logRows ?? []) {
    const key = `${log.schedule_id}:${log.lesson_date}`
    const existing = latest.get(key)
    if (!existing || log.revision_number > existing.revision_number) latest.set(key, log)
  }
  const logs = Array.from(latest.values())
    .sort((left, right) => right.lesson_date.localeCompare(left.lesson_date))
    .slice(0, LESSON_LIMIT)
  const keptIds = logs.map((log) => log.id)

  const [{ data: reviewRows }, { data: scoreRows }, { data: pointRows }] = await Promise.all([
    keptIds.length
      ? caller.from('lesson_log_student_reviews').select('lesson_log_id, lesson_remark').eq('student_id', studentId).in('lesson_log_id', keptIds)
      : Promise.resolve({ data: [] }),
    keptIds.length
      ? caller.from('lesson_review_scores').select('lesson_log_id, criterion_id, score, remark').eq('student_id', studentId).in('lesson_log_id', keptIds)
      : Promise.resolve({ data: [] }),
    caller.from('student_points').select('points, reason, kind').eq('student_id', studentId).order('id', { ascending: false }).limit(200),
  ])

  const statusByKey = new Map((statusRows ?? []).map((row: { key: string; label: string; attended: boolean }) => [row.key, row]))
  const criterionById = new Map((criteriaRows ?? []).map((row: { id: number; name: string; max_score: number }) => [row.id, row]))
  const statusByLog = new Map((attendanceRows ?? []).map((row: { lesson_log_id: number; attendance_status: string }) => [row.lesson_log_id, row.attendance_status]))

  const lessons: LessonFact[] = logs.map((log) => {
    const statusKey = statusByLog.get(log.id) ?? 'present'
    const status = statusByKey.get(statusKey)
    return {
      date: log.lesson_date,
      status: status?.label ?? statusKey,
      attended: status?.attended ?? statusKey === 'present',
      scores: (scoreRows ?? [])
        .filter((row: { lesson_log_id: number }) => row.lesson_log_id === log.id)
        .flatMap((row: { criterion_id: number; score: number; remark: string | null }) => {
          const criterion = criterionById.get(row.criterion_id)
          return criterion ? [{ criterion: criterion.name, score: row.score, max: criterion.max_score, remark: row.remark }] : []
        }),
      lessonRemark:
        (reviewRows ?? []).find((row: { lesson_log_id: number }) => row.lesson_log_id === log.id)?.lesson_remark ?? null,
    }
  })

  const points = pointRows ?? []
  const facts = buildFacts(
    {
      firstName: firstNameOf(student.full_name),
      age: typeof student.age === 'number' ? student.age : null,
      className: classroom?.name ?? null,
      lessons,
      points: {
        total: points.reduce((sum: number, row: { points: number }) => sum + row.points, 0),
        recent: points
          .filter((row: { kind: string; points: number }) => row.kind === 'award' && row.points > 0)
          .slice(0, 10)
          .map((row: { reason: string; points: number }) => `${row.reason} (+${row.points})`),
      },
    },
    settings.sources,
  )

  const schoolName = Deno.env.get('SCHOOL_NAME')?.trim() || 'the school'
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  let answer = ''
  // A longer history can take Gemini a while; two tries of 35 s and 45 s stay inside the 150 s limit.
  for (const [attempt, timeout] of [35000, 45000].entries()) {
    const last = attempt === 1
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: buildSystemPrompt(audience, settings, schoolName) }] },
            contents: [{ role: 'user', parts: [{ text: facts }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1500, responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(timeout),
        },
      )
      if (!response.ok) {
        const text = (await response.text()).slice(0, 300).split(geminiKey).join('***')
        console.error('Gemini error', response.status, text)
        if (!last && [429, 500, 502, 503, 504].includes(response.status)) continue
        return jsonResponse({ ok: false, error: `The AI service did not answer (Gemini ${response.status}). Try again in a moment.` }, 502)
      }
      const data = await response.json()
      const parts = data?.candidates?.[0]?.content?.parts
      answer = Array.isArray(parts)
        ? parts
            .filter((part: { thought?: boolean }) => part && part.thought !== true)
            .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
            .join('')
        : ''
      break
    } catch (problem) {
      console.error('Gemini request failed', problem instanceof Error ? problem.message : problem)
      if (!last) continue
      const reason =
        problem instanceof Error ? `${problem.name}: ${problem.message}`.slice(0, 160).split(geminiKey).join('***') : 'unknown'
      return jsonResponse({ ok: false, error: `The AI service did not answer (${reason}). Try again in a moment.` }, 502)
    }
  }

  const report = parseReport(answer)
  if (!report) return jsonResponse({ ok: false, error: 'The AI gave an answer that could not be used. Try again.' }, 502)

  const { data: saved, error: saveError } = await admin
    .from('student_ai_reports')
    .insert({
      student_id: studentId,
      audience,
      report,
      language: settings.language,
      sources: settings.sources,
      lesson_count: lessons.length,
      model,
      created_by: teacherId,
    })
    .select('id, created_at')
    .single()
  if (saveError) console.error('Could not save the report', saveError.message)

  return jsonResponse(
    { ok: true, id: saved?.id ?? null, createdAt: saved?.created_at ?? new Date().toISOString(), report, lessonCount: lessons.length },
    200,
  )
})
