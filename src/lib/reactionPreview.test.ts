import { describe, expect, it } from 'vitest'
import { describeWaRecord, formatReactionLine, mayBeReaction } from './reactionPreview'
import type { ChatwootMessage } from './whatsappInbox'

const message = (overrides: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id: 1,
  content: '😂',
  message_type: 1,
  created_at: 1,
  private: false,
  status: 'sent',
  source_id: 'WAID:3EB0',
  content_attributes: { in_reply_to: 5, in_reply_to_external_id: 'WAID:ACFF' },
  ...overrides,
})

describe('mayBeReaction', () => {
  it('accepts a lone emoji that quotes a message, with a skin tone too', () => {
    expect(mayBeReaction(message())).toBe(true)
    expect(mayBeReaction(message({ content: '👍🏻' }))).toBe(true)
    expect(mayBeReaction(message({ content: '❤️' }))).toBe(true)
  })

  it('leaves out anything that is more than one emoji, or not quoting, or typed in the CRM', () => {
    expect(mayBeReaction(message({ content: '😂😂' }))).toBe(false)
    expect(mayBeReaction(message({ content: 'ok 👍' }))).toBe(false)
    expect(mayBeReaction(message({ content_attributes: { in_reply_to: null } }))).toBe(false)
    expect(
      mayBeReaction(message({ content_attributes: { in_reply_to_external_id: 'WAID:A', crm_sender: { id: 1, name: 'Mei' } } })),
    ).toBe(false)
    expect(mayBeReaction(null)).toBe(false)
  })
})

describe('describeWaRecord', () => {
  it('words a message the way WhatsApp does in its chat list', () => {
    expect(describeWaRecord({ message: { conversation: '  hello\nthere ' } })).toBe('hello there')
    expect(describeWaRecord({ message: { audioMessage: { seconds: 11 } } })).toBe('🎤 0:11')
    expect(describeWaRecord({ message: { audioMessage: { seconds: 125 } } })).toBe('🎤 2:05')
    expect(describeWaRecord({ message: { imageMessage: {} } })).toBe('📷 Photo')
    expect(describeWaRecord({ message: { documentMessage: { fileName: 'fees.pdf' } } })).toBe('📄 fees.pdf')
    expect(describeWaRecord(null)).toBe('')
  })
})

describe('formatReactionLine', () => {
  it('says who reacted and to what', () => {
    expect(formatReactionLine('❤️', '🎤 0:11', true)).toBe('You reacted ❤️ to: "🎤 0:11"')
    expect(formatReactionLine('👍', 'ok', false)).toBe('Reacted 👍 to: "ok"')
    expect(formatReactionLine('👍', '', true)).toBe('You reacted 👍 to a message')
  })
})
