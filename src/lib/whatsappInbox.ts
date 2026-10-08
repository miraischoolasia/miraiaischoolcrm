// What the WhatsApp inbox knows about a chat, kept apart from the screens so the
// rules (which tab a chat sits in, whose number to show) are easy to test.

export type InboxTab = 'to_reply' | 'in_progress' | 'done'
export type OwnerFilter = 'everyone' | 'mine' | 'unassigned'

export type ChatwootAttachment = {
  id: number
  file_type: string
  extension?: string | null
  data_url: string
  thumb_url?: string | null
  file_size?: number | null
}

export type ChatwootMessage = {
  id: number
  content: string | null
  // 0 from the parent, 1 from us, 2 system note, 3 template.
  message_type: number
  created_at: number
  private: boolean
  status: string
  // WhatsApp's own id for the message. It only appears once WhatsApp has
  // accepted it, so an empty one on a message we sent means "still sending".
  source_id?: string | null
  // Only on messages still on this computer, waiting their turn to be sent.
  local?: 'queued' | 'sending' | 'cancelled'
  attachments?: ChatwootAttachment[]
  content_attributes?: {
    crm_sender?: { id?: number | string; name?: string }
    external_error?: string
    // Chatwoot keeps a deleted message as an empty shell with this flag.
    deleted?: boolean
  } | null
  sender?: { name?: string | null; type?: string | null } | null
}

export type ChatwootSender = {
  id: number
  name: string | null
  phone_number: string | null
  identifier: string | null
  thumbnail?: string | null
}

// What the CRM keeps on a chat. Chatwoot replaces all of these whenever one is
// saved, so every save sends the whole set.
export type ChatAttributes = {
  crm_owner_id?: number | string | null
  crm_owner_name?: string | null
  crm_lead_id?: number | string | null
}

export type ChatwootConversation = {
  id: number
  status: string
  unread_count: number
  // Seconds since epoch of the parent's unanswered message, 0 when answered.
  waiting_since: number
  timestamp: number
  last_activity_at: number
  custom_attributes?: ChatAttributes | null
  labels?: string[]
  meta: { sender: ChatwootSender }
  last_non_activity_message?: ChatwootMessage | null
}

// WhatsApp often hides a parent's number and hands over a long internal ID
// instead. Real Malaysian and Singapore numbers are 10 to 12 digits.
const REAL_PHONE_PREFIXES = ['60', '65']

export function getRealPhone(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 10 && digits.length <= 12 && REAL_PHONE_PREFIXES.some((p) => digits.startsWith(p))) {
    return digits
  }
  return null
}

export function formatPhone(digits: string) {
  if (digits.startsWith('60') && digits.length >= 10) {
    const national = digits.slice(2)
    return `+60 ${national.slice(0, 2)}-${national.slice(2, 5)} ${national.slice(5)}`
  }
  return `+${digits}`
}

export type ChatIdentity = {
  title: string
  // The number, or a plain reason there is none.
  subtitle: string
  hasRealPhone: boolean
  initials: string
}

export function getChatIdentity(sender: ChatwootSender): ChatIdentity {
  const phone = getRealPhone(sender.phone_number)
  // The helper that adds numbers to names writes "Name +60123456789".
  const cleanName = (sender.name ?? '').replace(/\s*\+\d{10,12}$/, '').trim()
  const nameIsJustDigits = /^\+?\d+$/.test(cleanName)
  const hasName = cleanName.length > 0 && !nameIsJustDigits

  const title = hasName ? cleanName : phone ? formatPhone(phone) : 'Hidden number'
  const subtitle = phone ? formatPhone(phone) : 'Number hidden by WhatsApp'
  const initials = hasName
    ? cleanName
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : phone
      ? phone.slice(-2)
      : '?'

  return { title, subtitle, hasRealPhone: phone !== null, initials }
}

export function getTab(conversation: Pick<ChatwootConversation, 'status' | 'waiting_since' | 'last_non_activity_message'>): InboxTab {
  if (conversation.status === 'resolved') {
    return 'done'
  }
  if (conversation.waiting_since > 0 || conversation.last_non_activity_message?.message_type === 0) {
    return 'to_reply'
  }
  return 'in_progress'
}

// A parent who has waited this long for an answer is flagged.
export const OVERDUE_SECONDS = 30 * 60
// Past this the chat is most likely an old one nobody closed, so it is labelled but
// not painted red, and not counted in the warning.
export const STALE_SECONDS = 24 * 60 * 60

// How long the parent has been waiting for a reply, or null when nobody is.
export function getWaitingSeconds(
  conversation: Pick<ChatwootConversation, 'status' | 'waiting_since' | 'last_non_activity_message'>,
  nowSeconds: number,
) {
  if (conversation.status === 'resolved') {
    return null
  }
  const last = conversation.last_non_activity_message
  const since =
    conversation.waiting_since > 0
      ? conversation.waiting_since
      : last?.message_type === 0 && !last.private
        ? last.created_at
        : 0
  return since > 0 ? Math.max(0, nowSeconds - since) : null
}

export function isOverdue(
  conversation: Pick<ChatwootConversation, 'status' | 'waiting_since' | 'last_non_activity_message'>,
  nowSeconds: number,
) {
  const waiting = getWaitingSeconds(conversation, nowSeconds)
  return waiting !== null && waiting >= OVERDUE_SECONDS
}

// Waited over 30 minutes but under a day: the chats that need someone now.
export function isRecentlyOverdue(
  conversation: Pick<ChatwootConversation, 'status' | 'waiting_since' | 'last_non_activity_message'>,
  nowSeconds: number,
) {
  const waiting = getWaitingSeconds(conversation, nowSeconds)
  return waiting !== null && waiting >= OVERDUE_SECONDS && waiting < STALE_SECONDS
}

export function formatWaiting(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`
}

export function getOwner(conversation: Pick<ChatwootConversation, 'custom_attributes'>) {
  const attributes = conversation.custom_attributes
  const id = attributes?.crm_owner_id
  if (id === null || id === undefined || id === '') {
    return null
  }
  return { id: Number(id), name: attributes?.crm_owner_name ?? 'Someone' }
}

// The lead this chat was tied to, if anyone did.
export function getLinkedLeadId(conversation: Pick<ChatwootConversation, 'custom_attributes'>) {
  const id = conversation.custom_attributes?.crm_lead_id
  if (id === null || id === undefined || id === '') {
    return null
  }
  const number = Number(id)
  return Number.isFinite(number) ? number : null
}

export function attachmentLabel(attachment: ChatwootAttachment) {
  switch (attachment.file_type) {
    case 'image':
      return 'Photo'
    case 'audio':
      return 'Voice message'
    case 'video':
      return 'Video'
    default:
      return 'File'
  }
}

export function getPreview(conversation: Pick<ChatwootConversation, 'last_non_activity_message'>) {
  const message = conversation.last_non_activity_message
  if (!message) {
    return ''
  }
  const text = (message.content ?? '').trim()
  if (text) {
    return text
  }
  const attachment = message.attachments?.[0]
  return attachment ? attachmentLabel(attachment) : ''
}

export type InboxFilters = {
  tab: InboxTab
  owner: OwnerFilter
  search: string
  currentUserId: number
}

export function filterConversations(conversations: ChatwootConversation[], filters: InboxFilters) {
  const query = filters.search.trim().toLowerCase()
  const digitsQuery = query.replace(/\D/g, '')

  return conversations
    .filter((conversation) => getTab(conversation) === filters.tab)
    .filter((conversation) => {
      const owner = getOwner(conversation)
      if (filters.owner === 'mine') {
        return owner?.id === filters.currentUserId
      }
      if (filters.owner === 'unassigned') {
        return owner === null
      }
      return true
    })
    .filter((conversation) => {
      if (!query) {
        return true
      }
      const sender = conversation.meta.sender
      const name = (sender.name ?? '').toLowerCase()
      const phone = (sender.phone_number ?? '').replace(/\D/g, '')
      const preview = getPreview(conversation).toLowerCase()
      return (
        name.includes(query) ||
        preview.includes(query) ||
        (digitsQuery.length >= 3 && phone.includes(digitsQuery))
      )
    })
    .sort((a, b) => b.last_activity_at - a.last_activity_at)
}

export function countByTab(conversations: ChatwootConversation[]) {
  const counts: Record<InboxTab, number> = { to_reply: 0, in_progress: 0, done: 0 }
  for (const conversation of conversations) {
    counts[getTab(conversation)] += 1
  }
  return counts
}

// Open chats with something nobody has looked at yet.
export function countUnread(conversations: ChatwootConversation[]) {
  return conversations.filter((c) => c.status !== 'resolved' && c.unread_count > 0).length
}

export function formatListTime(seconds: number, now = new Date()) {
  const date = new Date(seconds * 1000)
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (minutes < 1) {
    return 'now'
  }
  if (minutes < 60) {
    return `${minutes}m`
  }
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return `${Math.floor(minutes / 60)}h`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

export function formatMessageTime(seconds: number) {
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(
    new Date(seconds * 1000),
  )
}

export function formatDayLabel(seconds: number, now = new Date()) {
  const date = new Date(seconds * 1000)
  if (date.toDateString() === now.toDateString()) {
    return 'Today'
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return '?'
  }
  return words
    .map((word) => Array.from(word)[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export type SendState = 'sent' | 'sending' | 'stalled' | 'failed' | 'note' | 'incoming'

// How long a message may wait for WhatsApp before we warn that it may not have
// gone out.
export const SENDING_WARNING_SECONDS = 90

// Whether a message has really reached WhatsApp. A message we sent only counts
// as sent once WhatsApp gave it an id.
export function getSendState(message: ChatwootMessage, nowSeconds: number): SendState {
  if (message.message_type !== 1) {
    return 'incoming'
  }
  if (message.private) {
    return 'note'
  }
  if (message.status === 'failed') {
    return 'failed'
  }
  if (message.source_id) {
    return 'sent'
  }
  return nowSeconds - message.created_at > SENDING_WARNING_SECONDS ? 'stalled' : 'sending'
}

// Who sent a message from our side, for the small label under it.
export function getSenderLabel(message: ChatwootMessage) {
  if (message.message_type !== 1) {
    return null
  }
  return message.content_attributes?.crm_sender?.name ?? message.sender?.name ?? null
}
