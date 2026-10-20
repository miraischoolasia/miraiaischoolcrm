import { describe, expect, it } from 'vitest'
import { forwardFailureReason, forwardInOrder, forwardToEach, SOCIAL_WINDOW_REASON } from './forwardSend'

describe('forwardInOrder', () => {
  it('does not send the next part until WhatsApp has accepted the one before it', async () => {
    const log: string[] = []
    let nextId = 1
    await forwardInOrder(
      [10, 20],
      ['file', 'text'],
      async (targetId, part) => {
        log.push(`send ${part} to ${targetId}`)
        return { id: nextId++ }
      },
      async (targetId, messageId) => {
        // The file is slow to leave; the text after it must still wait for it.
        await new Promise((resolve) => setTimeout(resolve, messageId % 2 === 1 ? 15 : 1))
        log.push(`accepted ${messageId} in ${targetId}`)
      },
    )

    expect(log).toEqual([
      'send file to 10',
      'accepted 1 in 10',
      'send text to 10',
      'accepted 2 in 10',
      'send file to 20',
      'accepted 3 in 20',
      'send text to 20',
      'accepted 4 in 20',
    ])
  })

  it('stops at the first part that could not be sent, so nothing jumps ahead of it', async () => {
    const sent: string[] = []

    await expect(
      forwardInOrder(
        [10],
        ['first', 'second'],
        async (_targetId, part) => {
          sent.push(part)
          return { id: 1 }
        },
        async () => {
          throw new Error('timeout')
        },
      ),
    ).rejects.toThrow('timeout')

    expect(sent).toEqual(['first'])
  })
})

describe('forwardToEach', () => {
  it('tries every chat: one that refuses does not stop the others, and says why (2026-10-20)', async () => {
    const sent: string[] = []
    let nextId = 1
    const failures = await forwardToEach(
      [10, 20, 30],
      ['photo', 'text'],
      async (targetId, part) => {
        sent.push(`${part} to ${targetId}`)
        return { id: nextId++ }
      },
      async (targetId) => {
        if (targetId === 20) {
          // What the GoHighLevel bridge writes on a Messenger chat outside Facebook's 24 hours.
          throw Object.assign(new Error('failed'), {
            reason: "GoHighLevel answered 400: Can't send Facebook message as the last inbound message was earlier than 24 hours ago",
          })
        }
      },
    )
    expect(failures).toEqual([{ targetId: 20, reason: SOCIAL_WINDOW_REASON }])
    // Chat 20 stops at its first part; 10 and 30 get everything.
    expect(sent).toEqual(['photo to 10', 'text to 10', 'photo to 20', 'photo to 30', 'text to 30'])
  })

  it('says plainly why a chat did not get it', () => {
    expect(forwardFailureReason(new Error('timeout'))).toMatch(/not confirmed/)
    expect(forwardFailureReason(new Error('failed'))).toBe('It did not go through.')
    expect(forwardFailureReason(Object.assign(new Error('failed'), { reason: 'Contact not found' }))).toBe('Contact not found')
  })
})
