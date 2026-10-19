// The CRM's own copy of the inbox: every message and every chat, as Chatwoot has them. The chat-activity
// webhook writes what Chatwoot just told it; "Copy old chats" on the Team Replies page writes what the
// browser read through the gateway. Both turn Chatwoot's data into rows here, so the copy is the same
// whichever way a message arrived. No Deno or browser APIs, so both sides import it.
//
// Chatwoot sends a message in two shapes: a webhook (message_type 'incoming', times as ISO strings) and
// the API (message_type 0, times in seconds). Files are never copied, only what they are and their address.

export type SenderKind = 'parent' | 'staff' | 'automation' | 'phone' | 'system'

export type CopyAttachment = { type: string; url: string | null; name: string | null; size: number | null }

export type CopyMessage = {
  id: number
  conversation_id: number
  inbox_id: number | null
  // 0 from the parent, 1 from us, 2 activity line, 3 template.
  message_type: number
  direction: 'incoming' | 'outgoing' | null
  sender_kind: SenderKind
  // The person who sent it from the CRM (crm_sender.id); null otherwise.
  staff_id: number | null
  content: string | null
  attachments: CopyAttachment[]
  private: boolean
  deleted: boolean
  reply_to: number | null
  created_at: string
  updated_at: string | null
}

export type CopyChat = {
  conversation_id: number
  inbox_id: number | null
  channel: string | null
  contact_id: number | null
  contact_name: string | null
  contact_phone: string | null
  contact_identifier: string | null
  status: string | null
  owner_id: number | null
  unread_count: number | null
  waiting_since: string | null
  last_activity_at: string | null
}

export type CopyEvent = {
  event: string
  accountId: number | null
  chat: CopyChat | null
  messages: CopyMessage[]
}

type Json = Record<string, unknown>

function asObject(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null
}

function asId(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null
}

function asCount(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null
}

function asText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim()
  return text === '' ? null : text.slice(0, max)
}

// ISO string, seconds or milliseconds since 1970; null for nothing or 0 (Chatwoot's "not set").
export function asIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString()
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const raw = value.trim()
    const time = new Date(/^\d+(\.\d+)?$/.test(raw) ? Number(raw) * 1000 : raw)
    return Number.isNaN(time.getTime()) || time.getTime() <= 0 ? null : time.toISOString()
  }
  return null
}

const MESSAGE_TYPES: Record<string, number> = { incoming: 0, outgoing: 1, activity: 2, template: 3 }

function messageTypeOf(value: unknown): number | null {
  if (typeof value === 'number' && [0, 1, 2, 3].includes(value)) {
    return value
  }
  return typeof value === 'string' && value in MESSAGE_TYPES ? MESSAGE_TYPES[value] : null
}

// Who wrote it: the parent; a person in the CRM (crm_sender.id), the automatic sender (crm_sender.id 0);
// the phone (ours, with no sender: typed on the school's phone); or Chatwoot itself (activity lines, templates).
export function senderOf(messageType: number, attributes: Json | null): { kind: SenderKind; staffId: number | null } {
  if (messageType === 0) {
    return { kind: 'parent', staffId: null }
  }
  if (messageType !== 1) {
    return { kind: 'system', staffId: null }
  }
  const raw = asObject(attributes?.crm_sender)?.id
  if (raw === undefined || raw === null || raw === '') {
    return { kind: 'phone', staffId: null }
  }
  const id = Number(raw)
  if (id === 0) {
    return { kind: 'automation', staffId: null }
  }
  return Number.isSafeInteger(id) && id > 0 ? { kind: 'staff', staffId: id } : { kind: 'phone', staffId: null }
}

function nameFromUrl(url: string | null) {
  if (!url) {
    return null
  }
  try {
    const last = new URL(url).pathname.split('/').pop() ?? ''
    return asText(decodeURIComponent(last), 200)
  } catch {
    return null
  }
}

function attachmentsOf(value: unknown): CopyAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.slice(0, 20).flatMap((item) => {
    const attachment = asObject(item)
    const type = asText(attachment?.file_type, 30)
    if (!attachment || !type) {
      return []
    }
    const url = asText(attachment.data_url, 2000)
    return [{ type, url, name: asText(attachment.file_name, 200) ?? nameFromUrl(url), size: asCount(attachment.file_size) }]
  })
}

// One message, from the webhook or from the API. Null when it is not a message of a chat.
export function copyMessage(raw: unknown, conversationId?: number | null, inboxId?: number | null): CopyMessage | null {
  const message = asObject(raw)
  const id = asId(message?.id)
  const messageType = messageTypeOf(message?.message_type)
  const conversation = asId(conversationId) ?? asId(message?.conversation_id) ?? asId(asObject(message?.conversation)?.id)
  const createdAt = asIso(message?.created_at)
  if (!message || id === null || messageType === null || conversation === null || createdAt === null) {
    return null
  }
  const attributes = asObject(message.content_attributes)
  const sender = senderOf(messageType, attributes)
  return {
    id,
    conversation_id: conversation,
    inbox_id: asId(inboxId) ?? asId(message.inbox_id) ?? asId(asObject(message.inbox)?.id),
    message_type: messageType,
    direction: messageType === 0 ? 'incoming' : messageType === 1 || messageType === 3 ? 'outgoing' : null,
    sender_kind: sender.kind,
    staff_id: sender.staffId,
    content: typeof message.content === 'string' ? message.content.slice(0, 20_000) : null,
    attachments: attachmentsOf(message.attachments),
    private: message.private === true,
    deleted: attributes?.deleted === true,
    reply_to: asId(attributes?.in_reply_to),
    created_at: createdAt,
    updated_at: asIso(message.updated_at),
  }
}

// One chat, from a webhook's conversation or from the API's list of chats.
export function copyChat(raw: unknown): CopyChat | null {
  const conversation = asObject(raw)
  const id = asId(conversation?.id)
  if (!conversation || id === null) {
    return null
  }
  const meta = asObject(conversation.meta)
  const sender = asObject(meta?.sender)
  const phone = typeof sender?.phone_number === 'string' ? sender.phone_number.replace(/\D/g, '') : ''
  return {
    conversation_id: id,
    inbox_id: asId(conversation.inbox_id),
    channel: asText(conversation.channel, 60) ?? asText(meta?.channel, 60),
    contact_id: asId(sender?.id),
    contact_name: asText(sender?.name, 200),
    contact_phone: phone.length >= 6 && phone.length <= 30 ? phone : null,
    contact_identifier: asText(sender?.identifier, 200),
    status: asText(conversation.status, 20),
    owner_id: asId(asObject(conversation.custom_attributes)?.crm_owner_id),
    unread_count: asCount(conversation.unread_count),
    waiting_since: asIso(conversation.waiting_since),
    last_activity_at: asIso(conversation.last_activity_at),
  }
}

const CHAT_EVENTS = new Set(['conversation_created', 'conversation_updated', 'conversation_status_changed'])
const MESSAGE_EVENTS = new Set(['message_created', 'message_updated'])

// What a webhook says about the copy; null for an event the copy does not keep (typing, contacts, inboxes).
export function copyFromWebhook(payload: unknown): CopyEvent | null {
  const body = asObject(payload)
  const event = typeof body?.event === 'string' ? body.event : ''
  if (!body || (!CHAT_EVENTS.has(event) && !MESSAGE_EVENTS.has(event))) {
    return null
  }
  const accountId = asId(asObject(body.account)?.id)
  if (MESSAGE_EVENTS.has(event)) {
    const chat = copyChat(body.conversation)
    const message = copyMessage(body, chat?.conversation_id, asId(asObject(body.inbox)?.id) ?? chat?.inbox_id)
    return message ? { event, accountId, chat, messages: [message] } : null
  }
  const chat = copyChat(body)
  if (!chat) {
    return null
  }
  // A chat's event carries its newest message: a message the webhook missed is filled in from it.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .map((message) => copyMessage(message, chat.conversation_id, chat.inbox_id))
    .filter((message): message is CopyMessage => message !== null)
  return { event, accountId, chat, messages }
}
