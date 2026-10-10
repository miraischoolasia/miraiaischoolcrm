import { describe, expect, it } from 'vitest'
import { autoLeadFor } from './autoLead'
import type { SourceRule } from './sourceRules'
import type { LeadOption } from '../types/domain'
import type { ChatwootMessage } from './whatsappInbox'

const FROM = 1000

const options: LeadOption[] = [
  { id: 1, kind: 'source', label: 'Facebook', isActive: true, legacyKey: null, color: null },
  { id: 2, kind: 'tag', label: 'Free HOA', isActive: true, legacyKey: null, color: null },
]
const rules: SourceRule[] = [{ id: 1, phrase: 'free trial coding', sourceId: 1, tagIds: [2], isActive: true }]

const message = (overrides: Partial<ChatwootMessage>): ChatwootMessage => ({
  id: 1,
  content: 'Hi, I saw the free trial coding advert',
  message_type: 0,
  created_at: FROM + 10,
  private: false,
  status: 'sent',
  ...overrides,
})

describe('autoLeadFor', () => {
  it('makes a lead when the first message of a new chat matches a source rule', () => {
    const result = autoLeadFor([message({})], options, rules, FROM)

    expect(result?.rule).toBe('free trial coding')
    expect(result?.guess.source?.id).toBe(1)
    expect(result?.guess.tags.map((tag) => tag.id)).toEqual([2])
  })

  it('does nothing when no rule matches', () => {
    expect(autoLeadFor([message({ content: 'Hello, how much is it?' })], options, rules, FROM)).toBeNull()
  })

  it('leaves a chat that was already there before the cut-off alone', () => {
    expect(autoLeadFor([message({ created_at: FROM - 1 })], options, rules, FROM)).toBeNull()
  })

  it('leaves a chat the school started, even if the parent then writes the keyword', () => {
    const messages = [
      message({ id: 1, message_type: 1, content: 'Hello from Mirai', created_at: FROM + 1 }),
      message({ id: 2, created_at: FROM + 5 }),
    ]

    expect(autoLeadFor(messages, options, rules, FROM)).toBeNull()
  })

  it('looks at the first message, not the latest, and skips notes and system lines', () => {
    const messages = [
      message({ id: 3, content: 'free trial coding', created_at: FROM + 30 }),
      message({ id: 1, message_type: 2, content: 'Conversation opened', created_at: FROM + 1 }),
      message({ id: 2, content: 'Hello', created_at: FROM + 5 }),
    ]

    expect(autoLeadFor(messages, options, rules, FROM)).toBeNull()
  })
})
