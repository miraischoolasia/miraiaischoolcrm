import type { ZoomMeetingStatus } from './leadEnrolmentApi'

type MeetingLike = { startsAt: string; status?: ZoomMeetingStatus }

const statusOf = (meeting: MeetingLike): ZoomMeetingStatus => meeting.status ?? 'scheduled'

// The Zoom step is done when a meeting is set or has taken place; a cancelled one does not count.
export function hasZoomMeeting(meetings: MeetingLike[]): boolean {
  return meetings.some((meeting) => statusOf(meeting) !== 'cancelled')
}

// The meeting the message to the parent talks about: the next one still scheduled, else the last one scheduled.
// Completed and cancelled meetings are never put in a message.
export function nextScheduledMeeting<T extends MeetingLike>(meetings: T[], now: Date): T | null {
  const scheduled = meetings.filter((meeting) => statusOf(meeting) === 'scheduled')
  return scheduled.find((meeting) => new Date(meeting.startsAt).getTime() >= now.getTime()) ?? scheduled[scheduled.length - 1] ?? null
}
