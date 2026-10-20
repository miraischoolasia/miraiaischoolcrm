// Reads what Chatwoot sends for a new message and says what to remember about the chat.
// Kept apart from index.ts so it can be tested without the network.

export type ChatMessage = {
  conversationId: number
  // The Chatwoot contact of the chat; null when the payload does not say.
  contactId: number | null
  direction: 'incoming' | 'outgoing'
  at: Date
  name: string | null
  // Digits only; the database decides whether it is a real number.
  phone: string | null
  // The parent's whole message was just a request to stop (STOP, unsubscribe, 不要再发...).
  optOut: boolean
  // What a parent wrote (cut at 500 characters), so a flow can read their reply; null for a message of ours
  // or one with no text (a picture).
  text: string | null
  // Which kind of chat it is, and where it sits: the Chatwoot inbox (a WhatsApp number, a Facebook Page) and,
  // for Messenger / Instagram, the Page's name. Used to list the chat on its lead.
  channel: 'whatsapp' | 'messenger' | 'instagram'
  inboxId: number | null
  inboxName: string | null
  pageName: string | null
  // Where a GoHighLevel contact came from, as the bridge wrote it on the contact; null for any other chat.
  origin: ChatOrigin | null
}

export type ChatOrigin = {
  // The person came from a paid advert.
  paid: boolean
  // GoHighLevel's own source text and the advert campaign, when it has them.
  source: string | null
  campaign: string | null
  // When GoHighLevel first met this person: the lead's date.
  firstSeen: Date | null
  // The tags GoHighLevel has on the contact (at most 20).
  tags: string[]
}

export type ParsedEvent = { ok: true; message: ChatMessage } | { ok: false; reason: string }

type Json = Record<string, unknown>

function asObject(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null
}

function asId(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : null
}

function asText(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim()
  return text === '' ? null : text.slice(0, max)
}

function asDigits(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const digits = value.replace(/\D/g, '')
  return digits.length >= 6 && digits.length <= 30 ? digits : null
}

// Chatwoot writes the time as an ISO string; some versions use seconds since 1970.
function asTime(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value < 1e12 ? value * 1000 : value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const time = new Date(/^\d+$/.test(value.trim()) ? Number(value) * 1000 : value)
    return Number.isNaN(time.getTime()) ? null : time
  }
  return null
}

// What a parent writes, and nothing else, to be left alone. The WHOLE message must be one of these, so a
// sentence that merely contains the word does not count.
const STOP_WORDS = new Set([
  'stop',
  'stopmessages',
  'stopsending',
  'stopmessaging',
  'unsubscribe',
  'optout',
  'jangan hantar',
  'janganhantar',
  'berhenti',
  '不要再发',
  '不要再发了',
  '别再发',
  '别再发了',
  '不要发了',
  '别发了',
  '取消订阅',
  '退订',
  '停止',
])

// What the bridge (ghl_bridge.py) writes on a GoHighLevel contact: ghl_paid, ghl_source, ghl_campaign, ghl_first_seen, ghl_tags.
function originOf(attributes: Json | null): ChatOrigin | null {
  if (!attributes || (attributes.ghl_first_seen === undefined && attributes.ghl_paid === undefined)) {
    return null
  }
  return {
    paid: attributes.ghl_paid === true || attributes.ghl_paid === 'true',
    source: asText(attributes.ghl_source),
    campaign: asText(attributes.ghl_campaign),
    firstSeen: asTime(attributes.ghl_first_seen),
    tags: Array.isArray(attributes.ghl_tags)
      ? attributes.ghl_tags.map((tag) => asText(tag, 60)).filter((tag): tag is string => tag !== null).slice(0, 20)
      : [],
  }
}

export function isStopRequest(content: unknown): boolean {
  if (typeof content !== 'string') {
    return false
  }
  const text = content
    .toLowerCase()
    .replace(/[\s.,!?;:'"()\[\]。，！？；：、]+/g, '')
  if (text === '' || text.length > 40) {
    return false
  }
  return STOP_WORDS.has(text) || STOP_WORDS.has(content.toLowerCase().replace(/[.,!?;:'"()\[\]。，！？；：、]+/g, '').trim())
}

// message_type is 'incoming' / 'outgoing' in a webhook (0 / 1 in the API). Activity and template
// messages are neither.
function directionOf(value: unknown): 'incoming' | 'outgoing' | null {
  if (value === 'incoming' || value === 0) {
    return 'incoming'
  }
  if (value === 'outgoing' || value === 1) {
    return 'outgoing'
  }
  return null
}

// What the server's number watch (whatsapp-sender/wa_watch.py) puts at the start of the WhatsApp note it sends to
// the team when a school number stops working. Such a note is not a reply to a parent: it moves no lead and starts
// no automation (the inbox copy still keeps it).
export const SYSTEM_ALERT_MARK = '【CRM 系统提醒】'

// Only a real message in a chat counts: a new message from the parent (incoming) or from the team
// (outgoing). Private notes, the number watch's notes, activity lines and every other kind of event are ignored.
export function parseChatwootEvent(payload: unknown): ParsedEvent {
  const body = asObject(payload)
  if (!body) {
    return { ok: false, reason: 'not an object' }
  }
  if (body.event !== 'message_created') {
    return { ok: false, reason: 'not a new message' }
  }
  if (body.private === true) {
    return { ok: false, reason: 'private note' }
  }
  const direction = directionOf(body.message_type)
  if (!direction) {
    return { ok: false, reason: 'not an incoming or outgoing message' }
  }
  if (direction === 'outgoing' && (typeof body.content === 'string' ? body.content : '').startsWith(SYSTEM_ALERT_MARK)) {
    return { ok: false, reason: 'number watch note' }
  }

  const conversation = asObject(body.conversation)
  const conversationId = asId(conversation?.id)
  if (conversationId === null) {
    return { ok: false, reason: 'no chat' }
  }

  const sender = asObject(body.sender)
  const metaSender = asObject(asObject(conversation?.meta)?.sender)
  const contactInbox = asObject(conversation?.contact_inbox)
  // For a message from the parent the sender IS the contact; for ours the contact is the chat's.
  const contactId =
    asId(metaSender?.id) ??
    asId(contactInbox?.contact_id) ??
    (direction === 'incoming' && sender?.type !== 'user' ? asId(sender?.id) : null)
  const contactSource = metaSender ?? (direction === 'incoming' ? sender : null)
  // A WhatsApp group is many people, not one parent: nobody "has not replied" in it.
  const address = asText(contactSource?.identifier) ?? asText(contactInbox?.source_id) ?? ''
  if (address.endsWith('@g.us') || /\(group\)\s*$/i.test(asText(contactSource?.name) ?? '')) {
    return { ok: false, reason: 'whatsapp group' }
  }

  // Messenger through our own Meta app is a Facebook Page channel; Messenger / Instagram through GoHighLevel
  // is a contact whose identifier starts with "ghl:" and whose attributes say which one.
  const attributes = asObject(contactSource?.additional_attributes) ?? asObject(metaSender?.additional_attributes)
  const inbox = asObject(body.inbox)
  const channelName = asText(conversation?.channel) ?? asText(inbox?.channel_type) ?? ''
  const identifier = asText(contactSource?.identifier) ?? asText(metaSender?.identifier) ?? ''
  let channel: ChatMessage['channel'] = 'whatsapp'
  if (channelName === 'Channel::FacebookPage') {
    channel = 'messenger'
  } else if (identifier.startsWith('ghl:')) {
    channel = attributes?.ghl_channel === 'IG' ? 'instagram' : 'messenger'
  }

  const at = asTime(body.created_at) ?? asTime(conversation?.timestamp) ?? new Date()

  return {
    ok: true,
    message: {
      conversationId,
      contactId,
      direction,
      at,
      name: asText(contactSource?.name),
      phone: asDigits(contactSource?.phone_number) ?? asDigits(contactInbox?.source_id),
      optOut: direction === 'incoming' && isStopRequest(body.content),
      text: direction === 'incoming' ? asText(body.content, 500) : null,
      channel,
      inboxId: asId(inbox?.id) ?? asId(conversation?.inbox_id),
      inboxName: asText(inbox?.name),
      pageName: asText(attributes?.ghl_page_name),
      origin: identifier.startsWith('ghl:') ? originOf(attributes) : null,
    },
  }
}
