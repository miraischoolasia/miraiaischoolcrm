// The parts of the Zoom functions that need no network, so they can be tested.

export type MeetingOptions = {
  mute_upon_entry?: boolean
  waiting_room?: boolean
  join_before_host?: boolean
  auto_recording?: 'cloud' | 'local' | 'none'
}

// "2026-10-21" + "20:30:00" -> "2026-10-21T20:30:00" (Zoom reads it in the given time zone).
export function zoomStartTime(lessonDate: string, startTime: string) {
  return `${lessonDate}T${startTime.slice(0, 5)}:00`
}

export function minutesBetween(startTime: string, endTime: string) {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes
  }
  return Math.max(15, toMinutes(endTime) - toMinutes(startTime))
}

// The meeting Zoom is asked to make: sign-up on (so each child gets a link of
// their own), approved by itself, and no e-mails from Zoom to anyone.
export function meetingBody(input: {
  topic: string
  lessonDate: string
  startTime: string
  endTime: string
  options: MeetingOptions
  registration: boolean
}) {
  return {
    topic: input.topic.slice(0, 200),
    type: 2,
    start_time: zoomStartTime(input.lessonDate, input.startTime),
    timezone: 'Asia/Kuala_Lumpur',
    duration: minutesBetween(input.startTime, input.endTime),
    settings: {
      mute_upon_entry: input.options.mute_upon_entry ?? true,
      waiting_room: input.options.waiting_room ?? false,
      join_before_host: input.options.join_before_host ?? false,
      auto_recording: input.options.auto_recording ?? 'none',
      ...(input.registration
        ? {
            approval_type: 0,
            registration_type: 1,
            registrants_email_notification: false,
            registrants_confirmation_email: false,
          }
        : { approval_type: 2 }),
    },
  }
}

// Zoom needs an e-mail for each sign-up. The child's own is never sent: an
// address made from the ids is used, which also tells the webhook who it is.
export function registrantEmail(sessionId: number, studentId: number, domain: string) {
  return `lesson${sessionId}.student${studentId}@${domain}`
}

export function studentIdFromEmail(email: string | null | undefined) {
  const match = /^lesson\d+\.student(\d+)@/i.exec(email ?? '')
  return match ? Number(match[1]) : null
}

// Zoom shows the first and last name in the meeting.
export function registrantNames(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: 'Student', last_name: '' }
  return { first_name: parts[0].slice(0, 64), last_name: parts.slice(1).join(' ').slice(0, 64) }
}

// ---------------------------------------------------------------------------
// Joining in the student app's page (Zoom Meeting SDK)

// The "tk" of a child's own sign-up link: with it the SDK joins as that
// sign-up, so the webhook knows the child (registrant id) as with the link.
export function tkFromJoinUrl(joinUrl: string | null | undefined) {
  if (!joinUrl) return null
  try {
    return new URL(joinUrl).searchParams.get('tk')
  } catch {
    return null
  }
}

// What the Meeting SDK signature says: the SDK app, the meeting, the role
// (0 = attendee) and two hours of validity, started 30 s back for clock drift.
export function sdkSignatureClaims(appKey: string, meetingNumber: string, role: 0 | 1, nowSeconds = Math.floor(Date.now() / 1000)) {
  const iat = nowSeconds - 30
  const exp = iat + 2 * 60 * 60
  return { appKey, sdkKey: appKey, mn: meetingNumber, role, iat, exp, tokenExp: exp, video_webrtc_mode: 1 }
}

function base64Url(bytes: Uint8Array) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// An HS256 JSON Web Token.
export async function signHs256(claims: Record<string, unknown>, secret: string) {
  const encoder = new TextEncoder()
  const head = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = base64Url(encoder.encode(JSON.stringify(claims)))
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${head}.${body}`)))
  return `${head}.${body}.${base64Url(signature)}`
}

// ---------------------------------------------------------------------------
// Webhook

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Zoom signs each call: x-zm-signature = "v0=" + HMAC(secret, "v0:<timestamp>:<body>").
// Calls more than 5 minutes old are refused.
export async function verifyZoomSignature(input: {
  secret: string
  body: string
  timestamp: string | null
  signature: string | null
  nowMs?: number
}) {
  if (!input.timestamp || !input.signature) return false
  const sentMs = Number(input.timestamp) * 1000
  if (!Number.isFinite(sentMs) || Math.abs((input.nowMs ?? Date.now()) - sentMs) > 5 * 60 * 1000) return false
  const expected = `v0=${await hmacHex(input.secret, `v0:${input.timestamp}:${input.body}`)}`
  if (expected.length !== input.signature.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ input.signature.charCodeAt(index)
  return difference === 0
}

// Zoom checks the address once: it sends a token and wants it signed back.
export async function urlValidationAnswer(secret: string, plainToken: string) {
  return { plainToken, encryptedToken: await hmacHex(secret, plainToken) }
}

export type ParticipantEvent = {
  kind: 'joined' | 'left' | 'waiting' | 'left_waiting'
  meetingId: string
  participantUuid: string
  userName: string | null
  email: string | null
  registrantId: string | null
  at: string
  // Zoom's own words for a leave, e.g. "left the meeting. Reason : Network connection error"
  leaveReason: string | null
  // The meeting's host (the teacher's Start as host), not a child or a stranger.
  isHost: boolean
}

const PARTICIPANT_EVENTS: Record<string, ParticipantEvent['kind']> = {
  'meeting.participant_joined': 'joined',
  'meeting.participant_left': 'left',
  'meeting.participant_joined_waiting_room': 'waiting',
  'meeting.participant_left_waiting_room': 'left_waiting',
}

export function readParticipantEvent(event: string, payload: unknown, receivedAt = new Date().toISOString()): ParticipantEvent | null {
  const kind = PARTICIPANT_EVENTS[event]
  if (!kind) return null
  const object = (payload as { object?: Record<string, unknown> } | null)?.object
  const participant = object?.participant as Record<string, unknown> | undefined
  if (!object || !participant) return null
  const leaving = kind === 'left' || kind === 'left_waiting'
  const timeField = leaving ? participant.leave_time : participant.join_time
  const at = String(timeField || participant.date_time || (kind === 'joined' ? '' : receivedAt))
  const uuid = String(participant.participant_uuid ?? participant.user_id ?? participant.id ?? '')
  if (!object.id || !uuid || !at) return null
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
  const hostId = text(object.host_id)
  return {
    kind,
    meetingId: String(object.id),
    participantUuid: uuid,
    userName: text(participant.user_name),
    email: text(participant.email),
    registrantId: text(participant.registrant_id),
    at,
    leaveReason: leaving ? text(participant.leave_reason)?.slice(0, 300) ?? null : null,
    isHost: !!hostId && (participant.id === hostId || participant.user_id === hostId),
  }
}

// A leave that Zoom only noticed after its time-out (the connection dropped:
// a closed browser tab, lost Wi-Fi), rather than the child pressing Leave or
// the teacher removing them / ending the meeting.
export function isDroppedLeave(reason: string | null | undefined) {
  if (!reason) return false
  return /network|connection|internet|failover|time ?out|timed out|unknown|lost/i.test(reason)
}

export type RecordingEvent = {
  meetingId: string
  recordingUuid: string
  shareUrl: string | null
  passcode: string | null
  startedAt: string | null
  durationMinutes: number | null
}

export function readRecordingEvent(event: string, payload: unknown): RecordingEvent | null {
  if (event !== 'recording.completed') return null
  const object = (payload as { object?: Record<string, unknown> } | null)?.object
  if (!object?.id || !object.uuid) return null
  return {
    meetingId: String(object.id),
    recordingUuid: String(object.uuid),
    shareUrl: typeof object.share_url === 'string' ? object.share_url : null,
    passcode:
      typeof object.recording_play_passcode === 'string'
        ? object.recording_play_passcode
        : typeof object.password === 'string'
          ? object.password
          : null,
    startedAt: typeof object.start_time === 'string' ? object.start_time : null,
    durationMinutes: typeof object.duration === 'number' ? object.duration : null,
  }
}

// Facebook gives one RTMPS address; Zoom wants the server part and the key
// apart (the key is everything after /rtmp/).
export function splitStreamUrl(secureStreamUrl: string) {
  const marker = secureStreamUrl.indexOf('/rtmp/')
  if (marker < 0) return null
  const at = marker + '/rtmp/'.length
  const streamUrl = secureStreamUrl.slice(0, at)
  const streamKey = secureStreamUrl.slice(at)
  return streamKey ? { streamUrl, streamKey } : null
}
