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

// Only a real message in a chat counts: a new message from the parent (incoming) or from the team
// (outgoing). Private notes, activity lines and every other kind of event are ignored.
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
    },
  }
}
