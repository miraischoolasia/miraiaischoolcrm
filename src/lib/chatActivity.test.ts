import { describe, expect, it } from 'vitest'
import { asZone, isStopRequest, mayBeStudentChat, parseChatwootEvent } from '../../supabase/functions/chat-activity/logic'
import { chatWebhookAddress, chatWebhookErrorMessage, describeAgo, isWebhookRecent } from './chatActivity'

const incoming = {
  event: 'message_created',
  id: 9000,
  content: 'Hello, is there a class on Saturday?',
  created_at: '2026-10-13T05:30:00.000Z',
  message_type: 'incoming',
  private: false,
  sender: { id: 42, name: 'Stella', type: 'contact', phone_number: '+60 12-255 2285' },
  conversation: {
    id: 77,
    status: 'open',
    meta: { sender: { id: 42, name: 'Stella', phone_number: '+60122552285' } },
    contact_inbox: { contact_id: 42, source_id: '60122552285' },
  },
}

describe('reading what the WhatsApp inbox sends for a message', () => {
  it('takes a message from the parent', () => {
    const parsed = parseChatwootEvent(incoming)
    expect(parsed).toEqual({
      ok: true,
      message: {
        conversationId: 77,
        contactId: 42,
        direction: 'incoming',
        at: new Date('2026-10-13T05:30:00.000Z'),
        name: 'Stella',
        phone: '60122552285',
        optOut: false,
        text: 'Hello, is there a class on Saturday?',
        channel: 'whatsapp',
        inboxId: null,
        inboxName: null,
        pageName: null,
        origin: null,
        automated: false,
      },
    })
  })

  it('knows a Messenger chat from GoHighLevel and which Page it wrote to', () => {
    const parsed = parseChatwootEvent({
      ...incoming,
      inbox: { id: 4, name: 'EduHero Online' },
      sender: { id: 55, name: 'Sim Guatyin', type: 'contact', identifier: 'ghl:abc123' },
      conversation: {
        id: 90,
        inbox_id: 4,
        meta: {
          sender: {
            id: 55,
            name: 'Sim Guatyin',
            identifier: 'ghl:abc123',
            additional_attributes: { ghl_channel: 'FB', ghl_page_name: 'EduHero 英雄教育 Online' },
          },
        },
      },
    })
    expect(parsed).toMatchObject({
      ok: true,
      message: {
        contactId: 55,
        phone: null,
        channel: 'messenger',
        inboxId: 4,
        inboxName: 'EduHero Online',
        pageName: 'EduHero 英雄教育 Online',
      },
    })
  })

  it('reads where a GoHighLevel person came from, as the bridge wrote it on the contact', () => {
    const withAttributes = (additional: Record<string, unknown>) => ({
      ...incoming,
      sender: { id: 55, name: 'Sim Guatyin', type: 'contact', identifier: 'ghl:abc123' },
      conversation: {
        id: 90,
        inbox_id: 4,
        meta: { sender: { id: 55, name: 'Sim Guatyin', identifier: 'ghl:abc123', additional_attributes: { ghl_channel: 'FB', ...additional } } },
      },
    })
    expect(
      parseChatwootEvent(
        withAttributes({ ghl_paid: true, ghl_source: 'SEJ MATERIAL下单RM99.00', ghl_campaign: '【1】万能教SEJARAH正课', ghl_first_seen: '2026-10-15T09:16:57.419Z', ghl_tags: ['fb-sej-material-99', '', 7, 'cuba-class'] }),
      ),
    ).toMatchObject({
      ok: true,
      message: {
        origin: {
          paid: true,
          source: 'SEJ MATERIAL下单RM99.00',
          campaign: '【1】万能教SEJARAH正课',
          firstSeen: new Date('2026-10-15T09:16:57.419Z'),
          tags: ['fb-sej-material-99', 'cuba-class'],
        },
      },
    })
    expect(parseChatwootEvent(withAttributes({ ghl_paid: false, ghl_first_seen: 'not a date' }))).toMatchObject({
      ok: true,
      message: { origin: { paid: false, source: null, campaign: null, firstSeen: null, tags: [] } },
    })
    // A contact the bridge has not written an origin on (an older one) has none.
    expect(parseChatwootEvent(withAttributes({}))).toMatchObject({ ok: true, message: { origin: null } })
  })

  it('knows an Instagram chat', () => {
    const parsed = parseChatwootEvent({
      ...incoming,
      sender: { id: 56, name: 'Vivien', type: 'contact', identifier: 'ghl:def456' },
      conversation: {
        id: 91,
        inbox_id: 4,
        meta: { sender: { id: 56, name: 'Vivien', identifier: 'ghl:def456', additional_attributes: { ghl_channel: 'IG' } } },
      },
    })
    expect(parsed).toMatchObject({ ok: true, message: { channel: 'instagram', inboxId: 4 } })
  })

  it('keeps the parent text (cut at 500 characters) and never the text of the team', () => {
    const long = 'a'.repeat(900)
    expect(parseChatwootEvent({ ...incoming, content: long })).toMatchObject({
      ok: true,
      message: { text: 'a'.repeat(500) },
    })
    expect(
      parseChatwootEvent({ ...incoming, message_type: 'outgoing', sender: { id: 5, name: 'Lex', type: 'user' } }),
    ).toMatchObject({ ok: true, message: { text: null } })
    expect(parseChatwootEvent({ ...incoming, content: null })).toMatchObject({ ok: true, message: { text: null } })
  })

  it('takes a message from the team, with the chat contact (not the team member) as the contact', () => {
    const parsed = parseChatwootEvent({
      ...incoming,
      message_type: 'outgoing',
      sender: { id: 5, name: 'Lex', type: 'user' },
    })
    expect(parsed).toMatchObject({
      ok: true,
      message: { direction: 'outgoing', contactId: 42, name: 'Stella', phone: '60122552285' },
    })
  })

  it('finds the contact from the chat when the payload has no meta', () => {
    const parsed = parseChatwootEvent({
      ...incoming,
      message_type: 'outgoing',
      sender: { id: 5, name: 'Lex', type: 'user' },
      conversation: { id: 77, contact_inbox: { contact_id: 42, source_id: '60122552285' } },
    })
    expect(parsed).toMatchObject({ ok: true, message: { contactId: 42, phone: '60122552285' } })
  })

  it('tells a message the automatic sender wrote (crm_sender.id 0) from one by a person or by the phone', () => {
    const outgoing = { ...incoming, message_type: 'outgoing', sender: { id: 5, name: 'Lex', type: 'user' } }
    const automated = (attributes: unknown) =>
      parseChatwootEvent({ ...outgoing, content_attributes: attributes }) as { message: { automated: boolean } }
    expect(automated({ crm_sender: { id: 0, name: 'Automation' } }).message.automated).toBe(true)
    expect(automated({ crm_sender: { id: '0', name: 'Automation' } }).message.automated).toBe(true)
    expect(automated({ crm_sender: { id: 7, name: 'Lex' } }).message.automated).toBe(false)
    expect(automated({}).message.automated).toBe(false)
    expect(automated(null).message.automated).toBe(false)
    expect(parseChatwootEvent({ ...incoming, content_attributes: { crm_sender: { id: 0 } } })).toMatchObject({
      message: { automated: false },
    })
  })

  it('never takes a team member as the contact of an outgoing message', () => {
    const parsed = parseChatwootEvent({
      ...incoming,
      message_type: 'outgoing',
      sender: { id: 5, name: 'Lex', type: 'user' },
      conversation: { id: 77 },
    })
    expect(parsed).toMatchObject({ ok: true, message: { contactId: null, name: null, phone: null } })
  })

  it('uses the sender as the contact for a parent message when the chat says nothing more', () => {
    const parsed = parseChatwootEvent({ ...incoming, conversation: { id: 77 } })
    expect(parsed).toMatchObject({ ok: true, message: { contactId: 42, name: 'Stella', phone: '60122552285' } })
  })

  it('reads the numeric message types of the API as well', () => {
    expect(parseChatwootEvent({ ...incoming, message_type: 0 })).toMatchObject({
      ok: true,
      message: { direction: 'incoming' },
    })
    expect(parseChatwootEvent({ ...incoming, message_type: 1 })).toMatchObject({
      ok: true,
      message: { direction: 'outgoing' },
    })
  })

  it('reads a time written in seconds', () => {
    const parsed = parseChatwootEvent({ ...incoming, created_at: 1781328600 })
    expect(parsed).toMatchObject({ ok: true })
    if (parsed.ok) {
      expect(parsed.message.at.getTime()).toBe(1781328600 * 1000)
    }
  })

  it('ignores private notes, activity lines and every other event', () => {
    expect(parseChatwootEvent({ ...incoming, private: true })).toEqual({ ok: false, reason: 'private note' })
    expect(parseChatwootEvent({ ...incoming, message_type: 'activity' })).toMatchObject({ ok: false })
    expect(parseChatwootEvent({ ...incoming, message_type: 2 })).toMatchObject({ ok: false })
    expect(parseChatwootEvent({ ...incoming, event: 'conversation_status_changed' })).toMatchObject({ ok: false })
    expect(parseChatwootEvent({ ...incoming, conversation: {} })).toEqual({ ok: false, reason: 'no chat' })
    expect(parseChatwootEvent(null)).toMatchObject({ ok: false })
    expect(parseChatwootEvent('text')).toMatchObject({ ok: false })
  })

  it("ignores the number watch's notes to the team, but not a parent who writes the same words", () => {
    const note = { ...incoming, message_type: 'outgoing', content: '【CRM 系统提醒】EduHero WhatsApp「EduHero WhatsApp 2」被登出了' }
    expect(parseChatwootEvent(note)).toEqual({ ok: false, reason: 'number watch note' })
    expect(parseChatwootEvent({ ...note, message_type: 'incoming' })).toMatchObject({ ok: true })
    expect(parseChatwootEvent({ ...note, content: '老师好【CRM 系统提醒】' })).toMatchObject({ ok: true })
  })

  it('ignores a message in a WhatsApp group', () => {
    const group = {
      ...incoming,
      conversation: {
        ...incoming.conversation,
        meta: { sender: { id: 90, name: 'Mirai Parents (GROUP)', phone_number: null, identifier: '120363025246125486@g.us' } },
        contact_inbox: { contact_id: 90, source_id: '120363025246125486@g.us' },
      },
    }
    expect(parseChatwootEvent(group)).toEqual({ ok: false, reason: 'whatsapp group' })
  })

  it('does not trust ids that are not whole numbers', () => {
    expect(parseChatwootEvent({ ...incoming, conversation: { id: -3 } })).toMatchObject({ ok: false })
    expect(parseChatwootEvent({ ...incoming, conversation: { id: '12abc' } })).toMatchObject({ ok: false })
    const parsed = parseChatwootEvent({ ...incoming, conversation: { id: '77', meta: { sender: { id: '42' } } } })
    expect(parsed).toMatchObject({ ok: true, message: { conversationId: 77, contactId: 42 } })
  })
})

describe('the address given to the WhatsApp inbox', () => {
  it('is the function address with the key', () => {
    expect(chatWebhookAddress('abc123def456ghi789', 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/functions/v1/chat-activity?key=abc123def456ghi789',
    )
    expect(chatWebhookAddress('k k', 'https://x.supabase.co/')).toBe(
      'https://x.supabase.co/functions/v1/chat-activity?key=k%20k',
    )
  })

  it('is empty when the project address is unknown', () => {
    expect(chatWebhookAddress('abc', '')).toBe('')
    expect(chatWebhookAddress('abc', undefined)).toBe(chatWebhookAddress('abc', import.meta.env.VITE_SUPABASE_URL))
  })

  it('says how long ago a message arrived', () => {
    const now = new Date('2026-10-13T12:00:00Z')
    expect(describeAgo(new Date('2026-10-13T11:59:50Z'), now)).toBe('just now')
    expect(describeAgo(new Date('2026-10-13T11:59:00Z'), now)).toBe('1 minute ago')
    expect(describeAgo(new Date('2026-10-13T11:15:00Z'), now)).toBe('45 minutes ago')
    expect(describeAgo(new Date('2026-10-13T09:00:00Z'), now)).toBe('3 hours ago')
    expect(describeAgo(new Date('2026-10-10T12:00:00Z'), now)).toBe('3 days ago')
  })

  it('counts a message from the last day as working', () => {
    const now = new Date('2026-10-13T12:00:00Z')
    expect(isWebhookRecent(null, now)).toBe(false)
    expect(isWebhookRecent(new Date('2026-10-13T00:00:00Z'), now)).toBe(true)
    expect(isWebhookRecent(new Date('2026-10-11T00:00:00Z'), now)).toBe(false)
  })

  it('explains a missing setup in words', () => {
    expect(chatWebhookErrorMessage(new Error('function chat_webhook_info does not exist'))).toBe(
      'Parent replies are not set up in the database yet.',
    )
    expect(chatWebhookErrorMessage(new Error('Only an admin can see this.'))).toBe('Only an admin can see this.')
    expect(chatWebhookErrorMessage(new Error('boom'))).toBe("Couldn't load the address.")
  })
})

describe('a parent asking not to be messaged again', () => {
  it('recognises a message that is only a request to stop', () => {
    for (const text of ['STOP', 'stop', ' Stop. ', 'Unsubscribe', 'jangan hantar', '不要再发', '不要再发了！', '取消订阅', '别再发了']) {
      expect(isStopRequest(text), text).toBe(true)
    }
  })

  it('does not take a sentence that merely contains the word', () => {
    for (const text of ['Please do not stop the class', 'stop by tomorrow?', 'ok thanks', '', '我们不要停止上课吧', 'When does the bus stop']) {
      expect(isStopRequest(text), text).toBe(false)
    }
    expect(isStopRequest(null)).toBe(false)
    expect(isStopRequest(42)).toBe(false)
  })

  it('marks a parent message but never one of ours', () => {
    expect(parseChatwootEvent({ ...incoming, content: 'STOP' })).toMatchObject({ ok: true, message: { optOut: true } })
    expect(
      parseChatwootEvent({ ...incoming, content: 'STOP', message_type: 'outgoing', sender: { id: 5, type: 'user' } }),
    ).toMatchObject({ ok: true, message: { optOut: false } })
  })
})

describe('a chat on a number of the Student Inbox', () => {
  it('counts as students only when the database says so', () => {
    expect(asZone('students')).toBe('students')
    expect(asZone('marketing')).toBe('marketing')
    expect(asZone(null)).toBe('marketing')
    expect(asZone(undefined)).toBe('marketing')
    expect(asZone('Students')).toBe('marketing')
  })

  it('asks only about WhatsApp chats with a known inbox', () => {
    expect(mayBeStudentChat({ channel: 'whatsapp', inboxId: 6 })).toBe(true)
    expect(mayBeStudentChat({ channel: 'whatsapp', inboxId: null })).toBe(false)
    expect(mayBeStudentChat({ channel: 'messenger', inboxId: 2 })).toBe(false)
    expect(mayBeStudentChat({ channel: 'instagram', inboxId: 4 })).toBe(false)
  })
})
