import { describe, expect, it } from 'vitest'
import {
  meetingBody,
  readParticipantEvent,
  readRecordingEvent,
  registrantEmail,
  registrantNames,
  studentIdFromEmail,
  urlValidationAnswer,
  verifyZoomSignature,
} from '../../supabase/functions/zoom-lesson/logic'

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('Zoom lessons', () => {
  it('asks for a meeting at the lesson time, with sign-up and no e-mails', () => {
    const body = meetingBody({
      topic: 'WED Coding Class C002 · 2026-10-21',
      lessonDate: '2026-10-21',
      startTime: '20:30:00',
      endTime: '21:30:00',
      options: { mute_upon_entry: true, auto_recording: 'cloud' },
      registration: true,
    })
    expect(body.start_time).toBe('2026-10-21T20:30:00')
    expect(body.timezone).toBe('Asia/Kuala_Lumpur')
    expect(body.duration).toBe(60)
    expect(body.settings).toMatchObject({
      auto_recording: 'cloud',
      approval_type: 0,
      registrants_email_notification: false,
      registrants_confirmation_email: false,
    })
  })

  it('signs a child up with a made-up address that tells who it is', () => {
    const email = registrantEmail(12, 345, 'students.example.com')
    expect(email).toBe('lesson12.student345@students.example.com')
    expect(studentIdFromEmail(email)).toBe(345)
    expect(studentIdFromEmail('teacher@school.com')).toBeNull()
    expect(registrantNames('Toh Jia Choon')).toEqual({ first_name: 'Toh', last_name: 'Jia Choon' })
    expect(registrantNames('  ')).toEqual({ first_name: 'Student', last_name: '' })
  })

  it('accepts only calls Zoom signed, and not old ones', async () => {
    const secret = 'zoom-secret'
    const body = '{"event":"meeting.participant_joined"}'
    const timestamp = '1792200000'
    const signature = `v0=${await hmac(secret, `v0:${timestamp}:${body}`)}`
    const nowMs = 1792200000 * 1000 + 1000
    expect(await verifyZoomSignature({ secret, body, timestamp, signature, nowMs })).toBe(true)
    expect(await verifyZoomSignature({ secret, body: `${body} `, timestamp, signature, nowMs })).toBe(false)
    expect(await verifyZoomSignature({ secret, body, timestamp, signature, nowMs: nowMs + 10 * 60 * 1000 })).toBe(false)
    expect(await verifyZoomSignature({ secret, body, timestamp: null, signature, nowMs })).toBe(false)
  })

  it('answers the address check', async () => {
    const answer = await urlValidationAnswer('zoom-secret', 'abc')
    expect(answer).toEqual({ plainToken: 'abc', encryptedToken: await hmac('zoom-secret', 'abc') })
  })

  it('reads joins, leaves and recordings', () => {
    const joined = readParticipantEvent('meeting.participant_joined', {
      object: {
        id: 123,
        participant: { participant_uuid: 'u1', user_name: 'Toh', email: 'lesson1.student9@x.com', join_time: '2026-10-21T12:30:00Z' },
      },
    })
    expect(joined).toMatchObject({ kind: 'joined', meetingId: '123', participantUuid: 'u1', at: '2026-10-21T12:30:00Z' })
    const left = readParticipantEvent('meeting.participant_left', {
      object: { id: 123, participant: { participant_uuid: 'u1', leave_time: '2026-10-21T13:25:00Z' } },
    })
    expect(left).toMatchObject({ kind: 'left', at: '2026-10-21T13:25:00Z' })
    expect(readParticipantEvent('meeting.started', { object: { id: 1 } })).toBeNull()
    expect(
      readRecordingEvent('recording.completed', {
        object: { id: 123, uuid: 'rec==', share_url: 'https://zoom.us/rec/share/x', recording_play_passcode: 'pw', duration: 58 },
      }),
    ).toMatchObject({ meetingId: '123', recordingUuid: 'rec==', shareUrl: 'https://zoom.us/rec/share/x', passcode: 'pw', durationMinutes: 58 })
  })
})
