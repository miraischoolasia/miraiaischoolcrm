// join_sdk: a child (or their parent) joins the lesson inside the student
// app's page with the Zoom Meeting SDK instead of opening the Zoom link.
//
// The caller is a student app login, not staff: the database says whether it
// may act for that child (portal_may_act_for) and whether the child is in the
// lesson (is_class_session_student). The child joins with their own sign-up
// (the tk of their link), so the webhook knows them as before; the waiting
// room and the teacher's Admit stay the same.
//
// A lesson the teacher opened without a meeting made here (EduHero's weekly
// lessons with a fixed Zoom link) joins that link's meeting in the page: its
// number comes from the link, its passcode from Zoom's API (the web SDK does
// not take the coded pwd in a link). When that cannot work (a meeting on
// another Zoom account, a personal link with a name) the answer says why and
// the app offers the link as a small fallback; it never opens it by itself.
//
// lesson_room { studentId, lessonDate, startTime } is the class page's
// waiting room before that: the lesson (title, class, teacher, time) and its
// class session once the teacher has opened it.
//
// Secrets: ZOOM_SDK_CLIENT_ID / ZOOM_SDK_CLIENT_SECRET (a Meeting SDK app on
// the school's Zoom account). Without them the app opens the Zoom link.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { meetingFromLink, registrantEmail, registrantNames, sdkSignatureClaims, signHs256, tkFromJoinUrl } from './logic.ts'
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
  if (!meeting) return joinFixedLink(env, admin, sessionId, studentId, student?.full_name ?? 'Student')

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

type Admin = ReturnType<typeof createClient>

// The lesson's fixed link: the weekly lesson's own, else its class's.
async function fixedLinkOf(admin: Admin, scheduleId: number) {
  const { data: schedule } = await admin.from('schedules').select('zoom_link, classroom_id').eq('id', scheduleId).maybeSingle()
  if (schedule?.zoom_link) return String(schedule.zoom_link)
  if (!schedule?.classroom_id) return null
  const { data: classroom } = await admin.from('classrooms').select('zoom_link').eq('id', schedule.classroom_id).maybeSingle()
  return classroom?.zoom_link ? String(classroom.zoom_link) : null
}

// An opened lesson without a meeting made here: its fixed link's meeting, in the page.
async function joinFixedLink(env: Env, admin: Admin, sessionId: number, studentId: number, fullName: string): Promise<Answer> {
  const { data: session } = await admin.from('class_sessions').select('schedule_id').eq('id', sessionId).maybeSingle()
  const link = session ? await fixedLinkOf(admin, Number(session.schedule_id)) : null
  if (!link) return { status: 409, body: { ok: false, error: 'The class has not opened yet. Please try again a little later.' } }

  const meetingNumber = meetingFromLink(link)
  if (!meetingNumber) return { status: 200, body: { ok: true, inPage: false, joinUrl: link, reason: 'link_unreadable' } }
  const sdkKey = Deno.env.get('ZOOM_SDK_CLIENT_ID')
  const sdkSecret = Deno.env.get('ZOOM_SDK_CLIENT_SECRET')
  if (!sdkKey || !sdkSecret) return { status: 200, body: { ok: true, inPage: false, joinUrl: link, reason: 'no_sdk' } }

  // The passcode: only Zoom knows it in plain words, and only for a meeting on the school's own account.
  let password: string | null = null
  try {
    const token = await zoomToken(env.accountId, env.clientId, env.clientSecret)
    const details = await zoomApi(token, `/meetings/${encodeURIComponent(meetingNumber)}`)
    password = typeof details.password === 'string' ? details.password : ''
  } catch {
    password = null
  }
  if (password === null) return { status: 200, body: { ok: true, inPage: false, joinUrl: link, reason: 'other_account' } }

  const signature = await signHs256(sdkSignatureClaims(sdkKey, meetingNumber, 0), sdkSecret)
  return {
    status: 200,
    body: {
      ok: true,
      inPage: true,
      joinUrl: link,
      signature,
      sdkKey,
      meetingNumber,
      password,
      tk: null,
      userName: fullName,
      userEmail: registrantEmail(sessionId, studentId, env.registrantDomain),
      customerKey: String(studentId),
    },
  }
}

// lesson_room: the lesson the class page waits for, and its class session once the teacher opened it.
export async function lessonRoom(env: Env, input: { studentId: unknown; lessonDate: unknown; startTime: unknown }): Promise<Answer> {
  const studentId = Number(input.studentId)
  const lessonDate = typeof input.lessonDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.lessonDate) ? input.lessonDate : null
  const startTime = typeof input.startTime === 'string' && /^\d{2}:\d{2}$/.test(input.startTime) ? input.startTime : null
  if (!Number.isInteger(studentId) || !lessonDate || !startTime) {
    return { status: 400, body: { ok: false, error: 'Say which child and which lesson.' } }
  }

  const caller = createClient(env.supabaseUrl, env.anonKey, { global: { headers: { Authorization: env.authHeader } } })
  const { data: mayAct } = await caller.rpc('portal_may_act_for', { p_student_id: studentId })
  if (mayAct !== true) return { status: 403, body: { ok: false, error: 'Not found.' } }

  const admin = createClient(env.supabaseUrl, env.serviceRoleKey)
  const { data: candidates } = await admin
    .from('schedules')
    .select('id, title, start_time, end_time, classroom_id, teacher_id')
    .eq('status', 'active')
    .gte('start_time', `${startTime}:00`)
    .lte('start_time', `${startTime}:59`)
  let lesson: { id: number; title: string; start_time: string; end_time: string; classroom_id: number | null; teacher_id: number | null } | null = null
  for (const candidate of candidates ?? []) {
    const [{ data: meets }, { data: inLesson }] = await Promise.all([
      caller.rpc('schedule_meets_on', { p_schedule_id: candidate.id, p_date: lessonDate }),
      caller.rpc('is_lesson_student', { p_schedule_id: candidate.id, p_lesson_date: lessonDate, p_student_id: studentId }),
    ])
    if (meets === true && inLesson === true) {
      lesson = candidate
      break
    }
  }
  if (!lesson) return { status: 404, body: { ok: false, error: 'This lesson is not on your timetable.' } }

  const [{ data: session }, { data: classroom }, { data: teacher }] = await Promise.all([
    admin.from('class_sessions').select('id').eq('schedule_id', lesson.id).eq('lesson_date', lessonDate).maybeSingle(),
    lesson.classroom_id ? admin.from('classrooms').select('name').eq('id', lesson.classroom_id).maybeSingle() : Promise.resolve({ data: null }),
    lesson.teacher_id ? admin.from('teachers').select('full_name').eq('id', lesson.teacher_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return {
    status: 200,
    body: {
      ok: true,
      sessionId: session?.id ?? null,
      lesson: {
        title: lesson.title,
        class: classroom?.name ?? null,
        teacher: teacher?.full_name ?? null,
        date: lessonDate,
        start: String(lesson.start_time).slice(0, 5),
        end: String(lesson.end_time).slice(0, 5),
      },
    },
  }
}
