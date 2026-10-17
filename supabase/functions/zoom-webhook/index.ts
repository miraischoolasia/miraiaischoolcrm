// Zoom tells us what happened in a lesson's meeting: who joined and left
// (for filling in attendance from the minutes online) and the recording once
// it is ready (shown in the student app under that lesson). Only meetings made
// by zoom-lesson are kept; everything else is ignored.
//
// Set up in the school's Zoom app (Event Subscriptions), pointing at this
// function, with the events meeting.participant_joined,
// meeting.participant_left and recording.completed.
//
// Secret: ZOOM_WEBHOOK_SECRET (the app's "Secret Token"). No login: every event
// must carry Zoom's signature (only the address check is answered without one).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  readParticipantEvent,
  readRecordingEvent,
  studentIdFromEmail,
  urlValidationAnswer,
  verifyZoomSignature,
} from '../zoom-lesson/logic.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405)
  const secret = Deno.env.get('ZOOM_WEBHOOK_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !supabaseUrl || !serviceRoleKey) return json({ ok: false, error: 'Not set up.' }, 503)

  const raw = await req.text()
  let message: { event?: string; payload?: Record<string, unknown> }
  try {
    message = JSON.parse(raw)
  } catch {
    return json({ ok: false }, 400)
  }

  // Zoom checks the address when it is saved (the check may come unsigned):
  // the answer is the token signed with the secret, which proves we hold it.
  if (message.event === 'endpoint.url_validation') {
    const plainToken = String(message.payload?.plainToken ?? '')
    if (!plainToken) return json({ ok: false }, 400)
    return json(await urlValidationAnswer(secret, plainToken))
  }

  const signed = await verifyZoomSignature({
    secret,
    body: raw,
    timestamp: req.headers.get('x-zm-request-timestamp'),
    signature: req.headers.get('x-zm-signature'),
  })
  if (!signed) return json({ ok: false }, 401)

  const event = message.event ?? ''
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const meetingIdOf = (payload: unknown) => String((payload as { object?: { id?: unknown } })?.object?.id ?? '')
  const { data: meeting } = await admin
    .from('class_session_zoom')
    .select('session_id')
    .eq('meeting_id', meetingIdOf(message.payload))
    .maybeSingle()
  if (!meeting) return json({ ok: true, ignored: true })

  const participant = readParticipantEvent(event, message.payload)
  if (participant) {
    let studentId: number | null = null
    if (participant.registrantId) {
      const { data: link } = await admin
        .from('class_session_zoom_links')
        .select('student_id')
        .eq('session_id', meeting.session_id)
        .eq('registrant_id', participant.registrantId)
        .maybeSingle()
      studentId = link?.student_id ?? null
    }
    studentId ??= studentIdFromEmail(participant.email)

    if (participant.kind === 'joined') {
      await admin.from('zoom_participation').upsert(
        {
          session_id: meeting.session_id,
          student_id: studentId,
          participant_uuid: participant.participantUuid,
          user_name: participant.userName,
          joined_at: participant.at,
        },
        { onConflict: 'session_id,participant_uuid,joined_at', ignoreDuplicates: true },
      )
    } else {
      const { data: open } = await admin
        .from('zoom_participation')
        .select('id')
        .eq('session_id', meeting.session_id)
        .eq('participant_uuid', participant.participantUuid)
        .is('left_at', null)
        .lte('joined_at', participant.at)
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (open) await admin.from('zoom_participation').update({ left_at: participant.at }).eq('id', open.id)
    }
    return json({ ok: true })
  }

  const recording = readRecordingEvent(event, message.payload)
  if (recording) {
    await admin.from('class_session_recordings').upsert(
      {
        session_id: meeting.session_id,
        zoom_recording_uuid: recording.recordingUuid,
        share_url: recording.shareUrl,
        passcode: recording.passcode,
        started_at: recording.startedAt,
        duration_minutes: recording.durationMinutes,
      },
      { onConflict: 'session_id,zoom_recording_uuid' },
    )
    return json({ ok: true })
  }

  return json({ ok: true, ignored: true })
})
