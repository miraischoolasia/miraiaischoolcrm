import { describe, expect, it } from 'vitest'
import { forwardInOrder } from './forwardSend'

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
