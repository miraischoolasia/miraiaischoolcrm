// Zoom tells us what happened in a lesson's meeting: who joined and left
// (for filling in attendance from the minutes online) and the recording once
// it is ready (shown in the student app under that lesson). Only meetings made
// by zoom-lesson are kept; everything else is ignored.
//
// Set up in the school's Zoom app (Event Subscriptions), pointing at this
// function, with the events meeting.participant_joined,
// meeting.participant_left, meeting.participant_joined_waiting_room,
// meeting.participant_left_waiting_room, meeting.started, meeting.ended and
// recording.completed (meeting.started / ended run Facebook Live).
//
// Secret: ZOOM_WEBHOOK_SECRET (the app's "Secret Token"). No login: every event
// must carry Zoom's signature (only the address check is answered without one).
import {
  isDroppedLeave,
  readParticipantEvent,
  readRecordingEvent,
  studentIdFromEmail,
  urlValidationAnswer,
  verifyZoomSignature,
} from '../zoom-lesson/logic.ts'
import { readRecordingFiles } from '../zoom-lesson/recordings.ts'

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
  let message: { event?: string; payload?: Record<string, unknown>; download_token?: unknown }
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
  // Loaded only for real events, so Zoom's address check (which must be
  // answered within 3 seconds, even on a cold start) does not wait for it.
  const { createClient } = await import('jsr:@supabase/supabase-js@2')
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const meetingIdOf = (payload: unknown) => String((payload as { object?: { id?: unknown } })?.object?.id ?? '')
  const { data: meeting } = await admin
    .from('class_session_zoom')
    .select('session_id')
    .eq('meeting_id', meetingIdOf(message.payload))
    .maybeSingle()
  if (!meeting) return json({ ok: true, ignored: true })

  if (event === 'meeting.started' || event === 'meeting.ended') {
    const { data: zoom } = await admin.from('class_session_zoom').select('*').eq('session_id', meeting.session_id).maybeSingle()
    const starting = event === 'meeting.started'
    if (zoom && (starting ? zoom.fb_live_wanted && !zoom.fb_live_id : zoom.fb_live_id)) {
      const accountId = Deno.env.get('ZOOM_ACCOUNT_ID')
      const clientId = Deno.env.get('ZOOM_CLIENT_ID')
      const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
      const { zoomToken } = await import('../zoom-lesson/zoomApi.ts')
      const { goLiveOnFacebook, stopFacebookLive } = await import('../zoom-lesson/facebook.ts')
      const work = (async () => {
        const token = accountId && clientId && clientSecret ? await zoomToken(accountId, clientId, clientSecret) : null
        if (starting) {
          if (token) await goLiveOnFacebook(admin, token, zoom)
        } else await stopFacebookLive(admin, token, zoom)
      })().catch((problem) => console.error('facebook live', problem instanceof Error ? problem.message : problem))
      // Answered first: Zoom only waits 3 seconds.
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
      if (runtime) runtime.waitUntil(work)
      else await work
    }
    return json({ ok: true })
  }

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

    const closeWaiting = async (at: string) => {
      let query = admin.from('zoom_waiting').update({ left_at: at }).eq('session_id', meeting.session_id).is('left_at', null).lte('entered_at', at)
      query = studentId
        ? query.or(`participant_uuid.eq."${participant.participantUuid.replace(/"/g, '')}",student_id.eq.${studentId}`)
        : query.eq('participant_uuid', participant.participantUuid)
      await query
    }

    if (participant.kind === 'joined') {
      await admin.from('zoom_participation').upsert(
        {
          session_id: meeting.session_id,
          student_id: studentId,
          participant_uuid: participant.participantUuid,
          user_name: participant.userName,
          joined_at: participant.at,
          is_host: participant.isHost,
        },
        { onConflict: 'session_id,participant_uuid,joined_at', ignoreDuplicates: true },
      )
      // Admitted from the waiting room.
      await closeWaiting(participant.at)
    } else if (participant.kind === 'left') {
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
      if (open) {
        await admin
          .from('zoom_participation')
          .update({ left_at: participant.at, leave_reason: participant.leaveReason, dropped: isDroppedLeave(participant.leaveReason) })
          .eq('id', open.id)
      }
    } else if (participant.kind === 'waiting') {
      await admin.from('zoom_waiting').upsert(
        {
          session_id: meeting.session_id,
          student_id: studentId,
          participant_uuid: participant.participantUuid,
          user_name: participant.userName,
          entered_at: participant.at,
        },
        { onConflict: 'session_id,participant_uuid,entered_at', ignoreDuplicates: true },
      )
    } else {
      await closeWaiting(participant.at)
    }
    return json({ ok: true })
  }

  const recording = readRecordingEvent(event, message.payload)
  if (recording) {
    const { data: row } = await admin
      .from('class_session_recordings')
      .upsert(
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
      .select('id, session_id, zoom_recording_uuid, bunny_library_id, bunny_video_id, bunny_status, zoom_deleted_at')
      .single()
    // Bunny fetches the video from Zoom; answered first, since Zoom only waits 3 seconds.
    if (row && !row.bunny_status) {
      const { files, downloadToken } = readRecordingFiles(message)
      const { sendToBunny } = await import('../zoom-lesson/bunny.ts')
      const sending = sendToBunny(admin, row, files, downloadToken)
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } }).EdgeRuntime
      if (runtime) runtime.waitUntil(sending)
      else await sending
    }
    return json({ ok: true })
  }

  return json({ ok: true, ignored: true })
})
