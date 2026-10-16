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
  socialKindOf,
  categoryOf,
  firstCategory,
  numbersContacted,
  unreadByCategory,
  confirmsBySource,
  isGroupChat,
  isMessengerChannel,
  isOnAllowedNumber,
  onePerParent,
  getChatRole,
  getInitials,
  getLinkedStudentIds,
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

describe('Facebook Messenger chats', () => {
  const sender = { id: 5, name: 'Mei Lin', phone_number: null, identifier: null }

  it('shows the name and Messenger, with no phone warning', () => {
    const identity = getChatIdentity(sender, null, 'Channel::FacebookPage')
    expect(identity).toMatchObject({
      title: 'Mei Lin',
      subtitle: 'Facebook Messenger',
      hasRealPhone: true,
      isGroup: false,
      initials: 'ML',
    })
    // The name a staff member gave the lead wins, like for WhatsApp.
    expect(getChatIdentity(sender, 'Mrs Tan', 'Channel::FacebookPage').title).toBe('Mrs Tan')
    expect(getChatIdentity({ ...sender, name: null }, null, 'Channel::FacebookPage').title).toBe('Messenger user')
  })

  it('leaves a WhatsApp chat as it was', () => {
    expect(getChatIdentity(sender, null, 'Channel::Api').subtitle).toBe('Number hidden by WhatsApp')
    expect(isMessengerChannel('Channel::FacebookPage')).toBe(true)
    expect(isMessengerChannel('Channel::Api')).toBe(false)
    expect(isMessengerChannel(undefined)).toBe(false)
  })
})

describe('WhatsApp groups', () => {
  it('knows a group by its address or by the (GROUP) its name ends with', () => {
    expect(isGroupChat({ identifier: '120363025246125486@g.us', name: 'Class A' })).toBe(true)
    expect(isGroupChat({ identifier: null, name: 'Mirai AI X Kai Yang (GROUP)' })).toBe(true)
    expect(isGroupChat({ identifier: '60123456789@s.whatsapp.net', name: 'Lex +60123456789' })).toBe(false)
    expect(isGroupChat({ identifier: null, name: null })).toBe(false)
  })

  it('shows a group by its subject, marked as a group, with no phone warning', () => {
    const identity = getChatIdentity({
      id: 1,
      name: 'Mirai AI X Kai Yang (GROUP)',
      phone_number: null,
      identifier: '120363025246125486@g.us',
    })
    expect(identity).toMatchObject({
      title: 'Mirai AI X Kai Yang (group)',
      subtitle: 'WhatsApp group',
      hasRealPhone: true,
      isGroup: true,
      initials: 'MA',
    })
  })
})

describe('getChatIdentity', () => {
  it('never shows the name WhatsApp gives, only the number', () => {
    const identity = getChatIdentity({ id: 1, name: 'Lex +60126326319', phone_number: '+60126326319', identifier: null })
    expect(identity.title).toBe('+60 12-632 6319')
    expect(identity.subtitle).toBe('+60 12-632 6319')
    expect(identity.hasRealPhone).toBe(true)
    // The picture is the initials of the WhatsApp name, not of the number.
    expect(identity.initials).toBe('L')
    // It is kept only so the chat can be matched to a lead.
    expect(identity.name).toBe('Lex')
  })

  it('shows the number as the title when there is no name', () => {
    const identity = getChatIdentity({ id: 1, name: '60126838960', phone_number: '+60126838960', identifier: null })
    expect(identity.title).toBe('+60 12-683 8960')
  })

  it('says so plainly when WhatsApp hides the number', () => {
    const identity = getChatIdentity({ id: 1, name: '1215643541729', phone_number: '+1215643541729', identifier: null })
    expect(identity.title).toBe('WhatsApp user')
    expect(identity.name).toBeNull()
    expect(identity.subtitle).toBe('Number hidden by WhatsApp')
    expect(identity.hasRealPhone).toBe(false)
  })

  it('calls a chat WhatsApp gave no name by the parent name on its lead', () => {
    const hidden = { id: 1, name: '1215643541729', phone_number: '+1215643541729', identifier: null }
    const identity = getChatIdentity(hidden, '  @YYMDZ1973 ')
    expect(identity.title).toBe('@YYMDZ1973')
    // WhatsApp gave no name, so the picture is a question mark, not the number or the parent name.
    expect(identity.initials).toBe('?')
    // The chat itself still has no name, and the number is still hidden.
    expect(identity.name).toBeNull()
    expect(identity.subtitle).toBe('Number hidden by WhatsApp')
    expect(getChatIdentity(hidden, null).title).toBe('WhatsApp user')
    expect(getChatIdentity(hidden, '   ').title).toBe('WhatsApp user')
  })

  it('keeps the picture on the WhatsApp name when the title is the parent name', () => {
    const named = { id: 1, name: 'Yvonne Tan', phone_number: '+60126326319', identifier: null }
    const identity = getChatIdentity(named, '@YYMDZ1973')
    expect(identity.title).toBe('@YYMDZ1973')
    expect(identity.initials).toBe('YT')
  })

  it('calls a chat by the parent name from the lead, else the number', () => {
    const named = { id: 1, name: 'Lex +60126326319', phone_number: '+60126326319', identifier: null }
    expect(getChatIdentity(named, 'Mr Lee').title).toBe('Mr Lee')
    expect(getChatIdentity(named, null).title).toBe('+60 12-632 6319')
    expect(getChatIdentity(named, '  ').title).toBe('+60 12-632 6319')
  })
})

describe('onePerParent', () => {
  const withSender = (id: number, senderId: number, activity: number) => {
    const chat = conversation({ id, last_activity_at: activity })
    return { ...chat, meta: { ...chat.meta, sender: { ...chat.meta.sender, id: senderId } } }
  }

  it('keeps only the newest chat of a parent whose chats were merged', () => {
    const chats = [withSender(1, 50, 100), withSender(2, 50, 300), withSender(3, 51, 200)]
    expect(onePerParent(chats).map((chat) => chat.id)).toEqual([2, 3])
  })

  it('leaves chats of different parents alone', () => {
    const chats = [withSender(1, 50, 100), withSender(2, 51, 300)]
    expect(onePerParent(chats)).toHaveLength(2)
  })

  it('keeps the chat a parent has on each WhatsApp number', () => {
    const onNumber = (chat: ReturnType<typeof withSender>, inboxId: number) => ({ ...chat, inbox_id: inboxId })
    const chats = [
      onNumber(withSender(1, 50, 100), 1),
      onNumber(withSender(2, 50, 300), 2),
      onNumber(withSender(3, 50, 200), 1),
    ]
    expect(onePerParent(chats).map((chat) => chat.id)).toEqual([2, 3])
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
  const base = { tab: 'chats' as const, search: '', tagId: null, sourceId: null }

  it('lists every open chat newest first, answered or not', () => {
    expect(filterConversations(list, base).map((c) => c.id)).toEqual([2, 3, 1])
    expect(filterConversations(list, { ...base, tab: 'done' }).map((c) => c.id)).toEqual([4])
  })

  it('finds a chat by the parent name on its lead', () => {
    const leadOf = (c: ChatwootConversation) =>
      c.id === 1 ? { tagIds: [], sourceId: null, fullName: '@YYMDZ1973' } : null
    expect(filterConversations(list, { ...base, search: 'yymdz' }, leadOf).map((c) => c.id)).toEqual([1])
    expect(filterConversations(list, { ...base, search: 'yymdz' }).map((c) => c.id)).toEqual([])
  })

  it('finds a chat by a child, student or label name, ignoring spaces and punctuation', () => {
    const namesOf = (c: ChatwootConversation) => (c.id === 3 ? ['Poh Yu Ni (child)', 'Poh Yu-Ni'] : [])
    const ids = (search: string) =>
      filterConversations(list, { ...base, search }, () => null, () => [], namesOf).map((c) => c.id)
    expect(ids('poh')).toEqual([3])
    expect(ids('yuni')).toEqual([3])
    expect(ids('YU NI')).toEqual([3])
    expect(ids('(child')).toEqual([3])
    expect(ids('nobody')).toEqual([])
    // A search with only punctuation does not match every chat.
    expect(ids('-')).toEqual([])
  })

  it('filters by the staff member who took the chat, or by chats nobody took', () => {
    const ids = (ownerId: number | 'none' | null) =>
      filterConversations(list, { ...base, ownerId }).map((c) => c.id)
    expect(ids(7)).toEqual([2, 3])
    expect(ids('none')).toEqual([1])
    expect(ids(99)).toEqual([])
    expect(ids(null)).toEqual([2, 3, 1])
  })

  it('shows only the chats of the WhatsApp numbers a person is given', () => {
    const numbered = [
      conversation({ id: 11, last_activity_at: 30, name: 'On main', inbox_id: 1 }),
      conversation({ id: 12, last_activity_at: 20, name: 'On sales', inbox_id: 2 }),
    ]
    expect(isOnAllowedNumber(numbered[0], null)).toBe(true)
    expect(isOnAllowedNumber(numbered[0], [2])).toBe(false)
    expect(isOnAllowedNumber(numbered[1], [1, 2])).toBe(true)
    // Numbers exist but this person has none: nothing, not everything.
    expect(isOnAllowedNumber(numbered[0], [])).toBe(false)
    // A chat that says nothing about its number is hidden from a restricted person.
    expect(isOnAllowedNumber({}, [1])).toBe(false)

    const ids = (inboxId: number | null) =>
      filterConversations(numbered, { ...base, inboxId }).map((c) => c.id)
    expect(ids(null)).toEqual([11, 12])
    expect(ids(2)).toEqual([12])
  })

  it('filters by what the students of the parent are', () => {
    const kindsOf = (c: ChatwootConversation) => (c.id === 1 ? (['regular'] as const).slice() : c.id === 2 ? ['hoa' as const] : [])
    const ids = (kind: 'regular' | 'hoa' | 'none' | null) =>
      filterConversations(list, { ...base, kind }, () => null, kindsOf).map((c) => c.id)
    expect(ids('regular')).toEqual([1])
    expect(ids('hoa')).toEqual([2])
    expect(ids('none')).toEqual([3])
    expect(ids(null)).toEqual([2, 3, 1])
  })

  it('filters by the tag or source of the lead the chat belongs to', () => {
    const leads: Record<number, { tagIds: number[]; sourceId: number | null }> = {
      1: { tagIds: [10, 11], sourceId: 5 },
      2: { tagIds: [11], sourceId: 6 },
    }
    const leadOf = (c: { id: number }) => leads[c.id] ?? null

    expect(filterConversations(list, { ...base, tagId: 11 }, leadOf).map((c) => c.id)).toEqual([2, 1])
    expect(filterConversations(list, { ...base, tagId: 10 }, leadOf).map((c) => c.id)).toEqual([1])
    expect(filterConversations(list, { ...base, sourceId: 6 }, leadOf).map((c) => c.id)).toEqual([2])
    expect(filterConversations(list, { ...base, tagId: 11, sourceId: 5 }, leadOf).map((c) => c.id)).toEqual([1])
  })

  it('hides chats with no lead while a tag or source is chosen', () => {
    expect(filterConversations(list, { ...base, tagId: 11 }).map((c) => c.id)).toEqual([])
  })

  it('also shows chats whose messages the server found for the search', () => {
    const withMatch = { ...base, search: 'fees', matchedIds: new Set([3]) }
    expect(filterConversations(list, withMatch).map((c) => c.id)).toEqual([3])
  })

  it('searches names, numbers and the last message', () => {
    expect(filterConversations(list, { ...base, search: 'lim' }).map((c) => c.id)).toEqual([2])
    expect(filterConversations(list, { ...base, search: '12345' }).map((c) => c.id)).toEqual([2, 3, 1])
    expect(filterConversations(list, { ...base, search: 'hello' }).map((c) => c.id)).toEqual([2, 3, 1])
    expect(filterConversations(list, { ...base, search: 'nobody' })).toEqual([])
  })

  it('lists only the open chats nobody has opened in Unread', () => {
    const withUnread = [
      conversation({ id: 1, unread_count: 2, last_activity_at: 10 }),
      conversation({ id: 2, unread_count: 0, last_activity_at: 30 }),
      conversation({ id: 3, status: 'resolved', unread_count: 5, last_activity_at: 40 }),
    ]

    expect(filterConversations(withUnread, { ...base, tab: 'unread' }).map((c) => c.id)).toEqual([1])
    expect(countByTab(withUnread)).toEqual({ chats: 2, unread: 1, done: 1 })
  })

  it('counts the tabs', () => {
    expect(countByTab(list)).toEqual({ chats: 3, unread: 0, done: 1 })
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

describe('getLinkedStudentIds', () => {
  it('reads the students tied to the chat by hand', () => {
    expect(getLinkedStudentIds({ custom_attributes: { crm_student_ids: [4, 9] } })).toEqual([4, 9])
  })

  it('is empty when none were tied, or the value is not a list', () => {
    expect(getLinkedStudentIds({ custom_attributes: {} })).toEqual([])
    expect(getLinkedStudentIds({ custom_attributes: null })).toEqual([])
    expect(getLinkedStudentIds({ custom_attributes: { crm_student_ids: 'x' as unknown as number[] } })).toEqual([])
  })
})

describe('getChatRole', () => {
  it('reads who the team said is on the chat', () => {
    expect(getChatRole({ custom_attributes: { crm_chat_role: 'parent' } })).toBe('parent')
    expect(getChatRole({ custom_attributes: { crm_chat_role: 'student' } })).toBe('student')
  })

  it('is null when nobody said, or the value is not a known one', () => {
    expect(getChatRole({ custom_attributes: {} })).toBeNull()
    expect(getChatRole({ custom_attributes: null })).toBeNull()
    expect(getChatRole({ custom_attributes: { crm_chat_role: 'uncle' as never } })).toBeNull()
  })
})

describe('socialKindOf', () => {
  const sender = (identifier: string | null, ghlChannel?: string) => ({
    id: 1,
    name: 'Mei Ling',
    phone_number: null,
    identifier,
    additional_attributes: ghlChannel ? { ghl_channel: ghlChannel } : null,
  })

  it('is null for a WhatsApp chat', () => {
    expect(socialKindOf('Channel::Whatsapp', sender('60123456789@s.whatsapp.net'))).toBeNull()
    expect(socialKindOf(undefined, sender(null))).toBeNull()
  })

  it('knows Messenger through our own Meta app', () => {
    expect(socialKindOf('Channel::FacebookPage', sender(null))).toBe('messenger')
  })

  it('knows Messenger and Instagram that come through GoHighLevel', () => {
    expect(socialKindOf('Channel::Api', sender('ghl:abc123', 'FB'))).toBe('messenger')
    expect(socialKindOf('Channel::Api', sender('ghl:abc123', 'IG'))).toBe('instagram')
    expect(socialKindOf('Channel::Api', sender('ghl:abc123'))).toBe('messenger')
  })

  it('shows such a chat by name with no phone warning', () => {
    const identity = getChatIdentity(sender('ghl:abc123', 'IG'), null, 'Channel::Api')
    expect(identity.title).toBe('Mei Ling')
    expect(identity.subtitle).toBe('Instagram')
    expect(identity.hasRealPhone).toBe(true)
    expect(getChatIdentity({ ...sender('ghl:abc123', 'IG'), name: null }, null, 'Channel::Api').title).toBe('Instagram user')
  })
})

describe('replies in a GoHighLevel chat', () => {
  const reply = (over: Partial<{ status: string; source_id: string | null; created_at: number }> = {}) =>
    ({ id: 1, content: 'hi', message_type: 1, created_at: 1000, private: false, status: 'sent', source_id: null, ...over }) as never

  it('knows which chats get no id back', () => {
    expect(confirmsBySource({ id: 1, name: 'x', phone_number: null, identifier: 'ghl:abc' })).toBe(false)
    expect(confirmsBySource({ id: 1, name: 'x', phone_number: null, identifier: '6012@s.whatsapp.net' })).toBe(true)
    expect(confirmsBySource(null)).toBe(true)
  })

  it('counts as sent a few seconds after, unless the bridge marked it failed', () => {
    expect(getSendState(reply(), 1002, false)).toBe('sending')
    expect(getSendState(reply(), 1005, false)).toBe('sent')
    expect(getSendState(reply({ status: 'failed' }), 1005, false)).toBe('failed')
  })

  it('still waits for the WhatsApp id in a WhatsApp chat', () => {
    expect(getSendState(reply(), 1005)).toBe('sending')
    expect(getSendState(reply({ source_id: 'WAID:3EB0' }), 1005)).toBe('sent')
  })
})

describe('the parts of the inbox', () => {
  const social = (id: number, kind: 'FB' | 'IG', unread = 0) =>
    conversation({
      id,
      inbox_id: 4,
      unread_count: unread,
      meta: {
        channel: 'Channel::Api',
        sender: { id: id + 100, name: 'Mei Ling', phone_number: null, identifier: `ghl:${id}`, additional_attributes: { ghl_channel: kind } },
      },
    } as never)
  const whatsapp = (id: number, unread = 0) => conversation({ id, inbox_id: 1, unread_count: unread, phone: '60123456789' })

  it('puts a chat under WhatsApp, Messenger or Instagram', () => {
    expect(categoryOf(whatsapp(1))).toBe('whatsapp')
    expect(categoryOf(social(2, 'FB'))).toBe('messenger')
    expect(categoryOf(social(3, 'IG'))).toBe('instagram')
  })

  it('lists one part at a time, and everything when none is picked', () => {
    const all = [whatsapp(1), social(2, 'FB'), social(3, 'IG')]
    const base = { tab: 'chats' as const, search: '', tagId: null, sourceId: null }
    expect(filterConversations(all, { ...base, category: 'whatsapp' }).map((c) => c.id)).toEqual([1])
    expect(filterConversations(all, { ...base, category: 'messenger' }).map((c) => c.id)).toEqual([2])
    expect(filterConversations(all, { ...base, category: 'instagram' }).map((c) => c.id)).toEqual([3])
    expect(filterConversations(all, base).map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('counts the unread chats of each part', () => {
    const all = [whatsapp(1, 2), whatsapp(2, 1), social(3, 'FB', 1), social(4, 'IG')]
    expect(unreadByCategory(all)).toEqual({ whatsapp: 2, messenger: 1, instagram: 0 })
  })

  it('opens on WhatsApp when the school has a WhatsApp chat, even if Messenger has more', () => {
    expect(firstCategory([whatsapp(1), social(2, 'FB'), social(3, 'FB')])).toBe('whatsapp')
  })

  it('opens on the part that has chats when there is no WhatsApp chat', () => {
    expect(firstCategory([social(1, 'FB'), social(2, 'FB'), social(3, 'IG')])).toBe('messenger')
    expect(firstCategory([social(1, 'IG'), social(2, 'IG'), social(3, 'FB')])).toBe('instagram')
    expect(firstCategory([social(1, 'FB'), social(2, 'IG')])).toBe('messenger')
  })

  it('opens on WhatsApp when there is no chat at all', () => {
    expect(firstCategory([])).toBe('whatsapp')
  })
})

describe('numbersContacted', () => {
  const label = (id: number) => (id === 1 ? 'Number A' : id === 2 ? 'Number B' : null)

  it('lists the numbers in the order the parent first wrote to them', () => {
    const chats = [
      { id: 30, inbox_id: 2, created_at: 2000 },
      { id: 10, inbox_id: 1, created_at: 1000 },
      { id: 40, inbox_id: 1, created_at: 3000 },
    ]
    expect(numbersContacted(chats, label)).toEqual([
      { inboxId: 1, label: 'Number A', since: 1000 },
      { inboxId: 2, label: 'Number B', since: 2000 },
    ])
  })

  it('names a number the school has not given a label', () => {
    expect(numbersContacted([{ id: 1, inbox_id: 9, created_at: 5 }], label)[0].label).toBe('Number 9')
  })

  it('has nothing for a parent with no chats', () => {
    expect(numbersContacted([], label)).toEqual([])
  })
})
