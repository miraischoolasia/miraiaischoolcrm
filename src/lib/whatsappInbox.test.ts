import { describe, expect, it } from 'vitest'
import {
  countByTab,
  formatWaiting,
  getWaitingSeconds,
  isOverdue,
  isRecentlyOverdue,
  countUnread,
  filterConversations,
  formatDayLabel,
  formatListTime,
  getChatIdentity,
  getInitials,
  getOwner,
  getPreview,
  getRealPhone,
  getSendState,
  getSenderLabel,
  getTab,
  SENDING_WARNING_SECONDS,
  type ChatwootConversation,
  type ChatwootMessage,
} from './whatsappInbox'

function conversation(overrides: Partial<ChatwootConversation> & { name?: string; phone?: string }): ChatwootConversation {
  const { name, phone, ...rest } = overrides
  return {
    id: 1,
    status: 'open',
    unread_count: 0,
    waiting_since: 0,
    timestamp: 100,
    last_activity_at: 100,
    meta: { sender: { id: 1, name: name ?? 'Sarah Tan', phone_number: phone ?? '+60123456789', identifier: null } },
    last_non_activity_message: { id: 1, content: 'Hello', message_type: 1, created_at: 100, private: false, status: 'sent' },
    ...rest,
  }
}

describe('getRealPhone', () => {
  it('accepts Malaysian and Singapore numbers', () => {
    expect(getRealPhone('+60123456789')).toBe('60123456789')
    expect(getRealPhone('+65 9123 4567')).toBe('6591234567')
  })

  it('rejects the long internal IDs WhatsApp sends instead', () => {
    expect(getRealPhone('+1215643541729')).toBeNull()
    expect(getRealPhone('77910941663233')).toBeNull()
    expect(getRealPhone(null)).toBeNull()
  })
})

describe('getChatIdentity', () => {
  it('uses the name and the number', () => {
    const identity = getChatIdentity({ id: 1, name: 'Lex +60126326319', phone_number: '+60126326319', identifier: null })
    expect(identity.title).toBe('Lex')
    expect(identity.subtitle).toBe('+60 12-632 6319')
    expect(identity.hasRealPhone).toBe(true)
    expect(identity.initials).toBe('L')
  })

  it('shows the number as the title when there is no name', () => {
    const identity = getChatIdentity({ id: 1, name: '60126838960', phone_number: '+60126838960', identifier: null })
    expect(identity.title).toBe('+60 12-683 8960')
  })

  it('says so plainly when WhatsApp hides the number', () => {
    const identity = getChatIdentity({ id: 1, name: '1215643541729', phone_number: '+1215643541729', identifier: null })
    expect(identity.title).toBe('Hidden number')
    expect(identity.subtitle).toBe('Number hidden by WhatsApp')
    expect(identity.hasRealPhone).toBe(false)
  })
})

describe('getTab', () => {
  it('keeps every open chat in one list, answered or not', () => {
    expect(getTab(conversation({ waiting_since: 500 }))).toBe('chats')
    expect(getTab(conversation({ waiting_since: 0 }))).toBe('chats')
  })

  it('puts resolved chats in done', () => {
    expect(getTab(conversation({ status: 'resolved', waiting_since: 500 }))).toBe('done')
  })
})

describe('getOwner', () => {
  it('reads who handles the chat', () => {
    expect(getOwner(conversation({ custom_attributes: { crm_owner_id: 7, crm_owner_name: 'Amy' } }))).toEqual({
      id: 7,
      name: 'Amy',
    })
    expect(getOwner(conversation({ custom_attributes: { crm_owner_id: null, crm_owner_name: null } }))).toBeNull()
    expect(getOwner(conversation({}))).toBeNull()
  })
})

describe('getPreview', () => {
  it('shows the text, or what kind of file was sent', () => {
    expect(getPreview(conversation({}))).toBe('Hello')
    const photo = conversation({
      last_non_activity_message: {
        id: 2,
        content: '',
        message_type: 0,
        created_at: 1,
        private: false,
        status: 'sent',
        attachments: [{ id: 1, file_type: 'image', data_url: 'x' }],
      },
    })
    expect(getPreview(photo)).toBe('Photo')
  })
})

describe('filterConversations', () => {
  const amy = { crm_owner_id: 7, crm_owner_name: 'Amy' }
  const list = [
    conversation({ id: 1, waiting_since: 5, last_activity_at: 10, name: 'Sarah Tan' }),
    conversation({ id: 2, waiting_since: 5, last_activity_at: 30, name: 'Mr Lim', custom_attributes: amy }),
    conversation({ id: 3, waiting_since: 0, last_activity_at: 20, name: 'Priya', custom_attributes: amy }),
    conversation({ id: 4, status: 'resolved', last_activity_at: 40, name: 'Done Dad' }),
  ]
  const base = { tab: 'chats' as const, owner: 'everyone' as const, search: '', currentUserId: 7 }

  it('lists every open chat newest first, answered or not', () => {
    expect(filterConversations(list, base).map((c) => c.id)).toEqual([2, 3, 1])
    expect(filterConversations(list, { ...base, tab: 'done' }).map((c) => c.id)).toEqual([4])
  })

  it('filters by who handles it', () => {
    expect(filterConversations(list, { ...base, owner: 'mine' }).map((c) => c.id)).toEqual([2, 3])
    expect(filterConversations(list, { ...base, owner: 'unassigned' }).map((c) => c.id)).toEqual([1])
  })

  it('searches names, numbers and the last message', () => {
    expect(filterConversations(list, { ...base, search: 'lim' }).map((c) => c.id)).toEqual([2])
    expect(filterConversations(list, { ...base, search: '12345' }).map((c) => c.id)).toEqual([2, 3, 1])
    expect(filterConversations(list, { ...base, search: 'hello' }).map((c) => c.id)).toEqual([2, 3, 1])
    expect(filterConversations(list, { ...base, search: 'nobody' })).toEqual([])
  })

  it('counts both tabs', () => {
    expect(countByTab(list)).toEqual({ chats: 3, done: 1 })
  })
})

describe('countUnread', () => {
  it('counts open chats with unseen messages', () => {
    const list = [
      conversation({ id: 1, unread_count: 2 }),
      conversation({ id: 2, unread_count: 0 }),
      conversation({ id: 3, unread_count: 4, status: 'resolved' }),
    ]
    expect(countUnread(list)).toBe(1)
  })
})

describe('time labels', () => {
  const now = new Date('2026-10-08T12:00:00')
  const at = (iso: string) => new Date(iso).getTime() / 1000

  it('shortens recent times in the list', () => {
    expect(formatListTime(at('2026-10-08T11:59:30'), now)).toBe('now')
    expect(formatListTime(at('2026-10-08T11:40:00'), now)).toBe('20m')
    expect(formatListTime(at('2026-10-08T09:00:00'), now)).toBe('3h')
    expect(formatListTime(at('2026-10-07T20:00:00'), now)).toBe('Yesterday')
    expect(formatListTime(at('2026-10-01T20:00:00'), now)).toBe('1 Oct')
  })

  it('names the day above a group of messages', () => {
    expect(formatDayLabel(at('2026-10-08T01:00:00'), now)).toBe('Today')
    expect(formatDayLabel(at('2026-10-07T01:00:00'), now)).toBe('Yesterday')
    expect(formatDayLabel(at('2026-09-01T01:00:00'), now)).toBe('1 September 2026')
  })
})

describe('getInitials', () => {
  it('takes the first letters of up to two words', () => {
    expect(getInitials('Amy Lim')).toBe('AL')
    expect(getInitials('amy')).toBe('A')
    expect(getInitials('Lex Chew Wei')).toBe('LC')
    expect(getInitials('王弈博')).toBe('王')
    expect(getInitials('  ')).toBe('?')
  })
})

describe('getSendState', () => {
  const sent: ChatwootMessage = { id: 1, content: 'Hi', message_type: 1, created_at: 1000, private: false, status: 'sent' }

  it('keeps spinning until WhatsApp has given the message an id', () => {
    expect(getSendState(sent, 1010)).toBe('sending')
    expect(getSendState({ ...sent, source_id: 'WAID:ABC' }, 1010)).toBe('sent')
  })

  it('warns when it has waited too long', () => {
    expect(getSendState(sent, 1000 + SENDING_WARNING_SECONDS + 1)).toBe('stalled')
  })

  it('shows failures, notes and incoming messages for what they are', () => {
    expect(getSendState({ ...sent, status: 'failed' }, 1010)).toBe('failed')
    expect(getSendState({ ...sent, private: true }, 1010)).toBe('note')
    expect(getSendState({ ...sent, message_type: 0 }, 1010)).toBe('incoming')
  })
})

describe('getSenderLabel', () => {
  const base: ChatwootMessage = { id: 1, content: 'Hi', message_type: 1, created_at: 1, private: false, status: 'sent' }

  it('shows who on our side wrote it', () => {
    expect(getSenderLabel({ ...base, content_attributes: { crm_sender: { id: 7, name: 'Amy' } } })).toBe('Amy')
    expect(getSenderLabel({ ...base, sender: { name: 'Lex Chew' } })).toBe('Lex Chew')
  })

  it('shows nothing for messages from the parent', () => {
    expect(getSenderLabel({ ...base, message_type: 0 })).toBeNull()
  })
})

describe('waiting too long', () => {
  const now = 1_800_000_000
  const open = (patch: Record<string, unknown>) =>
    ({ status: 'open', waiting_since: 0, last_non_activity_message: null, ...patch }) as Parameters<typeof getWaitingSeconds>[0]

  it('counts from the parent message that is still unanswered', () => {
    expect(getWaitingSeconds(open({ waiting_since: now - 600 }), now)).toBe(600)
  })

  it('falls back to the parent last message when the server has no waiting time', () => {
    const last = { message_type: 0, private: false, created_at: now - 900 }
    expect(getWaitingSeconds(open({ last_non_activity_message: last }), now)).toBe(900)
  })

  it('is nobody waiting when we spoke last, wrote a note, or the chat is done', () => {
    expect(getWaitingSeconds(open({ last_non_activity_message: { message_type: 1, private: false, created_at: now } }), now)).toBeNull()
    expect(getWaitingSeconds(open({ last_non_activity_message: { message_type: 0, private: true, created_at: now } }), now)).toBeNull()
    expect(getWaitingSeconds(open({ status: 'resolved', waiting_since: now - 5000 }), now)).toBeNull()
  })

  it('flags 30 minutes and more, and calls a day or more old', () => {
    expect(isOverdue(open({ waiting_since: now - 1799 }), now)).toBe(false)
    expect(isOverdue(open({ waiting_since: now - 1800 }), now)).toBe(true)
    expect(isRecentlyOverdue(open({ waiting_since: now - 3600 }), now)).toBe(true)
    expect(isRecentlyOverdue(open({ waiting_since: now - 3 * 86400 }), now)).toBe(false)
  })

  it('writes the wait the way people say it', () => {
    expect(formatWaiting(45 * 60)).toBe('45 min')
    expect(formatWaiting(3 * 3600 + 100)).toBe('3 h')
    expect(formatWaiting(2 * 86400 + 5)).toBe('2 d')
  })
})
