import { describe, expect, it } from 'vitest'
import { hasZoomMeeting, nextScheduledMeeting } from './zoomMeetingStatus'

const at = (day: number) => new Date(2026, 9, day, 20, 0).toISOString()

describe('zoom meeting status', () => {
  it('counts a scheduled or completed meeting as done, never a cancelled one', () => {
    expect(hasZoomMeeting([])).toBe(false)
    expect(hasZoomMeeting([{ startsAt: at(20), status: 'cancelled' }])).toBe(false)
    expect(hasZoomMeeting([{ startsAt: at(20), status: 'completed' }])).toBe(true)
    expect(hasZoomMeeting([{ startsAt: at(20), status: 'scheduled' }])).toBe(true)
  })

  it('talks about the next scheduled meeting, else the last scheduled one, and skips finished ones', () => {
    const now = new Date(2026, 9, 21)
    const meetings = [
      { id: 1, startsAt: at(18), status: 'scheduled' as const },
      { id: 2, startsAt: at(22), status: 'cancelled' as const },
      { id: 3, startsAt: at(25), status: 'scheduled' as const },
      { id: 4, startsAt: at(24), status: 'completed' as const },
    ]
    expect(nextScheduledMeeting(meetings, now)?.id).toBe(3)
    expect(nextScheduledMeeting(meetings, new Date(2026, 9, 30))?.id).toBe(3)
    expect(nextScheduledMeeting([meetings[1], meetings[3]], now)).toBeNull()
  })
})
