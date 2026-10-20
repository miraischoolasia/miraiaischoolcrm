import { describe, expect, it } from 'vitest'
import { chatSwitchOptions, type ChatSwitchSources } from './chatSwitch'
import type { LeadChannel } from './leadChannels'
import type { ChatwootConversation } from './whatsappInbox'

const chat = (
  id: number,
  contactId: number,
  inboxId: number,
  extra: { phone?: string | null; name?: string; at?: number; channel?: string; role?: 'parent' | 'student'; studentIds?: number[] } = {},
): ChatwootConversation => ({
  id,
  inbox_id: inboxId,
  status: 'open',
  unread_count: 0,
  waiting_since: 0,
  timestamp: extra.at ?? 100,
  last_activity_at: extra.at ?? 100,
  custom_attributes: { crm_chat_role: extra.role ?? null, crm_student_ids: extra.studentIds ?? [] },
  meta: {
    sender: { id: contactId, name: extra.name ?? 'Jack', phone_number: extra.phone === undefined ? '+60123456789' : extra.phone, identifier: null },
    channel: extra.channel ?? 'Channel::Api',
  },
})

const row = (contactId: number, inboxId: number, channel: LeadChannel['channel'], extra: Partial<LeadChannel> = {}): LeadChannel => ({
  id: contactId * 10 + inboxId,
  leadId: 1,
  channel,
  contactId,
  inboxId,
  inboxName: `Inbox ${inboxId}`,
  conversationId: null,
  name: 'Jack老师',
  pageName: channel === 'whatsapp' ? null : 'EduHero Page',
  firstSeenAt: '2026-10-01T00:00:00Z',
  ...extra,
})

const sources = (current: ChatwootConversation, conversations: ChatwootConversation[], rows: LeadChannel[], extra: Partial<ChatSwitchSources> = {}): ChatSwitchSources => ({
  rows,
  conversations,
  current,
  kindOf: (conversation) => (conversation.meta.channel === 'Channel::FacebookPage' ? 'messenger' : 'whatsapp'),
  accountOfChat: (conversation) => `Chat on ${conversation.inbox_id}`,
  accountOfRow: (entry) => `Row on ${entry.inboxId}`,
  childNamesOf: (conversation) => (conversation.custom_attributes?.crm_student_ids ?? []).map((id) => (id === 7 ? 'Lucas' : '?')),
  allowedInboxIds: null,
  ...extra,
})

describe('chatSwitchOptions', () => {
  it('lists every chat of the family: each WhatsApp number, Messenger, and a child on their own number', () => {
    const open = chat(1, 11, 1, { at: 300 })
    const second = chat(2, 11, 2, { at: 200 })
    const messenger = chat(3, 12, 5, { channel: 'Channel::FacebookPage', phone: null, name: 'Jack Lim', at: 500 })
    const lucas = chat(4, 13, 1, { phone: '+60198887777', name: 'Lucas', role: 'student', studentIds: [7], at: 400 })
    const options = chatSwitchOptions(sources(open, [second, messenger, lucas], [row(11, 1, 'whatsapp'), row(12, 5, 'messenger')]))

    expect(options.map((option) => [option.kind, option.account, option.who, option.current])).toEqual([
      ['whatsapp', 'Chat on 1', 'Jack', true],
      ['whatsapp', 'Chat on 2', 'Jack', false],
      ['whatsapp', 'Chat on 1', 'Child Lucas', false],
      ['messenger', 'Chat on 5', 'Jack Lim', false],
    ])
    expect(options[3]).toMatchObject({ conversationId: 3, lastAt: 500 })
  })

  it('shows a chat that is not loaded from its lead_channels row, without a time', () => {
    const open = chat(1, 11, 1)
    const options = chatSwitchOptions(sources(open, [], [row(12, 6, 'instagram', { conversationId: 88 })]))
    expect(options[1]).toMatchObject({ kind: 'instagram', conversationId: 88, account: 'Row on 6', who: 'Jack老师', lastAt: null, current: false })
  })

  it('lists one person on one number once, even with a hidden-ID contact or an older chat', () => {
    const open = chat(1, 11, 1, { at: 300 })
    const older = chat(9, 11, 1, { at: 100 })
    const hidden = chat(5, 21, 1, { phone: null })
    const options = chatSwitchOptions(sources(open, [older, hidden], [row(21, 1, 'whatsapp')]))
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ conversationId: 1, current: true })
  })

  it('leaves out a number or Page this account may not use', () => {
    const open = chat(1, 11, 1)
    const options = chatSwitchOptions(sources(open, [chat(2, 11, 2)], [row(12, 5, 'messenger')], { allowedInboxIds: [1, 5] }))
    expect(options.map((option) => option.account)).toEqual(['Chat on 1', 'Row on 5'])
  })
})
