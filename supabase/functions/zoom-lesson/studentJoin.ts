// join_sdk: a child (or their parent) joins the lesson inside the student
// app's page with the Zoom Meeting SDK instead of opening the Zoom link.
//
// The caller is a student app login, not staff: the database says whether it
// may act for that child (portal_may_act_for) and whether the child is in the
// lesson (is_class_session_student). The child joins with their own sign-up
// (the tk of their link), so the webhook knows them as before; the waiting
// room and the teacher's Admit stay the same.
//
// Secrets: ZOOM_SDK_CLIENT_ID / ZOOM_SDK_CLIENT_SECRET (a Meeting SDK app on
// the school's Zoom account). Without them the app opens the Zoom link.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { registrantEmail, registrantNames, sdkSignatureClaims, signHs256, tkFromJoinUrl } from './logic.ts'
import { zoomApi, zoomToken } from './zoomApi.ts'

type Env = {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  authHeader: string
  accountId: string
  clientId: string
  clientSecret: string
  registrantDomain: string
}

type Answer = { status: number; body: Record<string, unknown> }

export async function joinInPage(env: Env, input: { sessionId: unknown; studentId: unknown }): Promise<Answer> {
  const sessionId = Number(input.sessionId)
  const studentId = Number(input.studentId)
  if (!Number.isInteger(sessionId) || !Number.isInteger(studentId)) {
    return { status: 400, body: { ok: false, error: 'Say which lesson and which child.' } }
  }

  const caller = createClient(env.supabaseUrl, env.anonKey, { global: { headers: { Authorization: env.authHeader } } })
  const { data: mayAct } = await caller.rpc('portal_may_act_for', { p_student_id: studentId })
  if (mayAct !== true) return { status: 403, body: { ok: false, error: 'Not found.' } }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey)
  const { data: inLesson } = await caller.rpc('is_class_session_student', { p_session_id: sessionId, p_student_id: studentId })
  if (inLesson !== true) return { status: 403, body: { ok: false, error: 'This child is not in that lesson.' } }

  const [{ data: meeting }, { data: link }, { data: student }] = await Promise.all([
    admin.from('class_session_zoom').select('meeting_id, passcode, join_url, uses_registration').eq('session_id', sessionId).maybeSingle(),
    admin.from('class_session_zoom_links').select('join_url').eq('session_id', sessionId).eq('student_id', studentId).maybeSingle(),
    admin.from('students').select('full_name').eq('id', studentId).maybeSingle(),
  ])
  if (!meeting) return { status: 409, body: { ok: false, error: 'The class has not opened yet. Please try again a little later.' } }

  // The child's own sign-up; a child added to the lesson after the teacher
  // prepared it is signed up now.
  let joinUrl: string | null = link?.join_url ?? null
  const email = registrantEmail(sessionId, studentId, env.registrantDomain)
  if (!joinUrl && meeting.uses_registration) {
    const token = await zoomToken(env.accountId, env.clientId, env.clientSecret)
    const registrant = await zoomApi(token, `/meetings/${encodeURIComponent(meeting.meeting_id)}/registrants`, {
      method: 'POST',
      body: { email, ...registrantNames(student?.full_name ?? 'Student') },
    })
    joinUrl = String(registrant.join_url)
    await admin.from('class_session_zoom_links').upsert({
      session_id: sessionId,
      student_id: studentId,
      registrant_id: registrant.registrant_id ? String(registrant.registrant_id) : null,
      join_url: joinUrl,
    })
  }
  joinUrl ??= meeting.join_url ?? null

  const sdkKey = Deno.env.get('ZOOM_SDK_CLIENT_ID')
  const sdkSecret = Deno.env.get('ZOOM_SDK_CLIENT_SECRET')
  if (!sdkKey || !sdkSecret) {
    // In-page Zoom is not set up for this school: the app opens the link.
    return { status: 200, body: { ok: true, inPage: false, joinUrl } }
  }

  const signature = await signHs256(sdkSignatureClaims(sdkKey, String(meeting.meeting_id), 0), sdkSecret)
  return {
    status: 200,
    body: {
      ok: true,
      inPage: true,
      joinUrl,
      signature,
      sdkKey,
      meetingNumber: String(meeting.meeting_id),
      password: meeting.passcode ?? '',
      tk: tkFromJoinUrl(joinUrl),
      userName: student?.full_name ?? 'Student',
      userEmail: email,
      customerKey: String(studentId),
    },
  }
}
