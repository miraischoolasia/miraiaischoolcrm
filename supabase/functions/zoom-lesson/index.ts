// The Zoom meeting of one lesson, made with the school's own Zoom account.
//
// The lesson's teacher (or anyone who may edit classes) asks for a lesson by
// its timetable entry and date:
//   prepare   make the meeting if there is none, then sign up every child in
//             the lesson who has no link yet (each gets their own link, which
//             the student app shows; no e-mail goes to anyone)
//   start     a fresh host link to start the meeting (Zoom's host links expire)
// The meeting follows the school's Zoom options (Class Settings > Zoom) and is
// hosted by the teacher's own Zoom account, or when it is full at that time by
// another of the school's (Class Settings > Zoom).
//
// Secrets (set in each school's Supabase project, never in a table):
//   ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET   a Server-to-Server OAuth app
//   ZOOM_HOST_USER          the Zoom user who hosts when the school lists no accounts, default "me"
//   ZOOM_REGISTRANT_DOMAIN  domain for the made-up sign-up addresses, default "students.example.com"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { meetingBody, registrantEmail, registrantNames, type MeetingOptions } from './logic.ts'
import { zoomApi, zoomToken } from './zoomApi.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse({ ok: false, error: 'Function is not configured.' }, 500)
  const accountId = Deno.env.get('ZOOM_ACCOUNT_ID')
  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  if (!accountId || !clientId || !clientSecret) {
    return jsonResponse({ ok: false, error: 'The Zoom account has not been set up for this school yet.' }, 503)
  }
  const hostUser = Deno.env.get('ZOOM_HOST_USER') || 'me'
  const registrantDomain = Deno.env.get('ZOOM_REGISTRANT_DOMAIN') || 'students.example.com'

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization.' }, 401)

  let body: { action?: unknown; scheduleId?: unknown; lessonDate?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const action = body.action === 'start' ? 'start' : body.action === 'prepare' ? 'prepare' : null
  const scheduleId = Number(body.scheduleId)
  const lessonDate = typeof body.lessonDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.lessonDate) ? body.lessonDate : null
  if (!action || !Number.isInteger(scheduleId) || !lessonDate) {
    return jsonResponse({ ok: false, error: 'Say what to do, and which lesson.' }, 400)
  }

  // Who may: the database decides (open_class_session checks the teacher).
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: session, error: sessionError } = await caller.rpc('open_class_session', {
    p_schedule_id: scheduleId,
    p_lesson_date: lessonDate,
  })
  if (sessionError || !session) return jsonResponse({ ok: false, error: sessionError?.message ?? 'Lesson not found.' }, 403)
  const admin = createClient(supabaseUrl, serviceRoleKey)

  try {
    const token = await zoomToken(accountId, clientId, clientSecret)
    const { data: existing } = await admin.from('class_session_zoom').select('*').eq('session_id', session.id).maybeSingle()

    if (action === 'start') {
      if (!existing) return jsonResponse({ ok: false, error: 'Make the meeting first.' }, 409)
      const meeting = await zoomApi(token, `/meetings/${encodeURIComponent(existing.meeting_id)}`)
      return jsonResponse({ ok: true, startUrl: meeting.start_url ?? null }, 200)
    }

    let meeting = existing
    if (!meeting) {
      const [{ data: schedule }, { data: optionsRow }] = await Promise.all([
        caller.from('schedules').select('title, start_time, end_time, classroom_id').eq('id', scheduleId).maybeSingle(),
        caller.from('app_settings').select('value').eq('key', 'zoom_meeting_options').maybeSingle(),
      ])
      if (!schedule) return jsonResponse({ ok: false, error: 'Lesson not found.' }, 404)

      // A Zoom account with room at this time: the teacher's own first, then the
      // least busy of the school's (an idle one before a second meeting), in list order.
      const { data: hosts } = await caller.rpc('zoom_hosts_for_session', { p_session_id: session.id })
      const pool = (hosts ?? []) as { host_user: string; busy_with: string | null; meetings: number; preferred: boolean }[]
      let host = hostUser
      if (pool.length > 0) {
        const free = pool
          .map((entry, order) => ({ ...entry, order }))
          .filter((entry) => !entry.busy_with)
          .sort(
            (left, right) =>
              Number(right.preferred) - Number(left.preferred) || left.meetings - right.meetings || left.order - right.order,
          )[0]
        if (!free) {
          return jsonResponse(
            { ok: false, error: `All ${pool.length} Zoom accounts are full at this time. Add one in Class Settings > Zoom.` },
            409,
          )
        }
        host = free.host_user
      }

      const topic = `${schedule.title} · ${lessonDate}`
      const created = await zoomApi(token, `/users/${encodeURIComponent(host)}/meetings`, {
        method: 'POST',
        body: meetingBody({
          topic,
          lessonDate,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          options: (optionsRow?.value ?? {}) as MeetingOptions,
          registration: true,
        }),
      })
      const { data: saved, error: saveError } = await admin
        .from('class_session_zoom')
        .insert({
          session_id: session.id,
          meeting_id: String(created.id),
          join_url: created.join_url ?? null,
          passcode: created.password ?? null,
          uses_registration: true,
          topic,
          host_user: host === 'me' ? null : host,
        })
        .select('*')
        .single()
      if (saveError) throw new Error(`The meeting was made in Zoom (${created.id}) but could not be saved: ${saveError.message}`)
      meeting = saved
    }

    // Sign up the children who have no link yet.
    const [{ data: roster }, { data: links }] = await Promise.all([
      caller.rpc('class_session_roster', { p_session_id: session.id }),
      admin.from('class_session_zoom_links').select('student_id').eq('session_id', session.id),
    ])
    const linked = new Set((links ?? []).map((row: { student_id: number }) => row.student_id))
    const waiting = ((roster ?? []) as { student_id: number; full_name: string }[]).filter((row) => !linked.has(row.student_id))
    const problems: string[] = []
    for (const child of waiting) {
      try {
        const registrant = await zoomApi(token, `/meetings/${encodeURIComponent(meeting.meeting_id)}/registrants`, {
          method: 'POST',
          body: { email: registrantEmail(session.id, child.student_id, registrantDomain), ...registrantNames(child.full_name) },
        })
        const { error } = await admin.from('class_session_zoom_links').insert({
          session_id: session.id,
          student_id: child.student_id,
          registrant_id: registrant.registrant_id ? String(registrant.registrant_id) : null,
          join_url: String(registrant.join_url),
        })
        if (error) throw new Error(error.message)
        linked.add(child.student_id)
      } catch (problem) {
        problems.push(`${child.full_name}: ${problem instanceof Error ? problem.message : 'failed'}`)
      }
    }

    return jsonResponse(
      {
        ok: true,
        meetingId: meeting.meeting_id,
        joinUrl: meeting.join_url,
        host: meeting.host_user ?? null,
        linked: linked.size,
        roster: (roster ?? []).length,
        problems,
      },
      200,
    )
  } catch (problem) {
    return jsonResponse({ ok: false, error: problem instanceof Error ? problem.message : 'Zoom did not answer.' }, 502)
  }
})
