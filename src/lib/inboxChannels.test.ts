import { describe, expect, it } from 'vitest'
import { canReplyIn, channelDraftError } from './inboxChannels'

describe('inbox channels', () => {
  it('answers only where the channel and the Inbox tick both allow it', () => {
    const access = new Map<number, 'view' | 'reply' | 'none'>([
      [5, 'reply'],
      [6, 'view'],
      [7, 'none'],
    ])
    expect(canReplyIn(access, 5, true)).toBe(true)
    expect(canReplyIn(access, 6, true)).toBe(false)
    expect(canReplyIn(access, 7, true)).toBe(false)
    // A channel nobody set up is open: the tick decides.
    expect(canReplyIn(access, 9, true)).toBe(true)
    expect(canReplyIn(access, 5, false)).toBe(false)
    expect(canReplyIn(access, null, true)).toBe(true)
  })

  it('checks a channel before it is saved', () => {
    const channel = { inboxId: 5, kind: 'whatsapp' as const, label: 'Main', access: 'limited' as const, isActive: true }
    expect(channelDraftError(channel, [])).toMatch(/at least one/)
    expect(channelDraftError({ ...channel, access: 'open' }, [])).toBeNull()
    expect(channelDraftError(channel, [{ teamId: 1, level: 'view' }, { teamId: 1, level: 'reply' }])).toMatch(/twice/)
    expect(channelDraftError(channel, [{ teamId: 1, level: 'view' }, { teacherId: 1, level: 'reply' }])).toBeNull()
    expect(channelDraftError({ ...channel, inboxId: 0 }, [])).toMatch(/inbox/)
    expect(channelDraftError({ ...channel, label: ' ' }, [{ teamId: 1, level: 'view' }])).toMatch(/name/)
  })
})
