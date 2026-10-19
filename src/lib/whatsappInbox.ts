import type { StudentKind } from './studentLink'
import { withoutEditHeading } from './editCopy'
import { linkedMediaLabel } from './linkedMedia'

// What the WhatsApp inbox knows about a chat, kept apart from the screens so the
// rules (which tab a chat sits in, whose number to show) are easy to test.

// Every open chat is in Chats; Unread shows only the ones nobody has opened yet.
// A finished chat moves to Done.
export type InboxTab = 'chats' | 'unread' | 'done'
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
  // failed: this message did not go out; cancelled: it was held back because one before it did not.
  local?: 'queued' | 'sending' | 'failed' | 'cancelled'
  attachments?: ChatwootAttachment[]
  content_attributes?: {
    crm_sender?: { id?: number | string; name?: string }
    external_error?: string
    // Chatwoot keeps a deleted message as an empty shell with this flag.
    deleted?: boolean
    // The message this one answers (quoted), by Chatwoot's id and by WhatsApp's.
    in_reply_to?: number | null
    in_reply_to_external_id?: string | null
  } | null
  sender?: { name?: string | null; type?: string | null } | null
}

export type ChatwootSender = {
  id: number
  name: string | null
  phone_number: string | null
  identifier: string | null
  thumbnail?: string | null
  // What the contact carries (the GoHighLevel bridge notes its channel here: ghl_channel "FB" or "IG").
  additional_attributes?: Record<string, unknown> | null
}

// What the CRM keeps on a chat. Chatwoot replaces all of these whenever one is
// saved, so every save sends the whole set.
export type ChatAttributes = {
  crm_owner_id?: number | string | null
  crm_owner_name?: string | null
  crm_lead_id?: number | string | null
  // The team marked the chat unread by hand: a pink dot instead of a number, until it is opened.
  crm_marked_unread?: boolean
  // Kept at the top of the list for the whole team.
  crm_pinned?: boolean
  // Messages of this chat the team starred, by Chatwoot's id.
  crm_starred?: number[]
  // Messages pinned at the top of this chat for the whole team (newest first, at most 3, as on WhatsApp).
  crm_pinned_messages?: number[]
  // Students the team tied to this chat by hand, for a parent whose number matches nobody.
  crm_student_ids?: number[]
  // Who is on the other end of the chat: the parent of the student(s), or the student themself.
  crm_chat_role?: ChatRole | null
  // The role above was set by the page from what the person wrote; once the team changes or takes it back,
  // the page does not set it again.
  crm_role_auto?: boolean
}

export type ChatRole = 'parent' | 'student'

export type ChatwootConversation = {
  id: number
  // The Chatwoot inbox (= the WhatsApp number) the chat is on.
  inbox_id?: number
  status: string
  unread_count: number
  // Seconds since epoch of the parent's unanswered message, 0 when answered.
  waiting_since: number
  timestamp: number
  last_activity_at: number
  custom_attributes?: ChatAttributes | null
  labels?: string[]
  // channel: Chatwoot's name of the kind of inbox ("Channel::FacebookPage" for Messenger).
  meta: { sender: ChatwootSender; channel?: string }
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

// Who and what to tell the phone once the team has read these messages: the number, and WhatsApp's
// own ids of the parent's messages. Null for a chat whose number WhatsApp hides, which it cannot do.
export function getPhoneReadTarget(sender: { phone_number: string | null }, messages: ChatwootMessage[]) {
  const phone = getRealPhone(sender.phone_number)
  const ids = messages.flatMap((message) =>
    message.message_type === 0 && message.source_id?.startsWith('WAID:') ? [message.source_id.slice(5)] : [],
  )
  return phone && ids.length > 0 ? { phone, ids: ids.slice(-50) } : null
}

// The name to call the parent of a chat whose number WhatsApp hides (all there is is the username they
// show). Empty when the number is known, or when the name is only digits and symbols (a number).
export function getHiddenNumberName(sender: { name?: string | null; phone_number: string | null }) {
  if (getRealPhone(sender.phone_number)) {
    return ''
  }
  // The helper that adds numbers to names writes "Name +60123456789".
  const name = (sender.name ?? '').replace(/\s*\+\d{10,12}$/, '').trim()
  return /[^\d\s+()-]/.test(name) ? name : ''
}

export function formatPhone(digits: string) {
  if (digits.startsWith('60') && digits.length >= 10) {
    const national = digits.slice(2)
    return `+60 ${national.slice(0, 2)}-${national.slice(2, 5)} ${national.slice(5)}`
  }
  return `+${digits}`
}

// What a chat is called when WhatsApp gives neither a name nor a number.
export const UNNAMED_CHAT = 'WhatsApp user'

// A WhatsApp group chat. The WhatsApp helper gives the contact of a group the group's own address
// (...@g.us) and writes "Subject (GROUP)" as its name. A group has no parent's number and many writers.
export function isGroupChat(sender: { name?: string | null; identifier?: string | null }) {
  return (sender.identifier ?? '').endsWith('@g.us') || /\(group\)\s*$/i.test(sender.name ?? '')
}

// A Facebook Messenger chat: there is no phone number, and WhatsApp did not hide one.
export function isMessengerChannel(channel: string | null | undefined) {
  return channel === 'Channel::FacebookPage'
}

export type SocialKind = 'messenger' | 'instagram'

// A chat that is not WhatsApp: Messenger through our own Meta app, or Messenger / Instagram through
// GoHighLevel (its bridge names the contact "ghl:<id>" and notes the channel). Null for WhatsApp.
export function socialKindOf(channel: string | null | undefined, sender?: ChatwootSender | null): SocialKind | null {
  if (isMessengerChannel(channel)) {
    return 'messenger'
  }
  if (sender?.identifier?.startsWith('ghl:')) {
    return sender.additional_attributes?.ghl_channel === 'IG' ? 'instagram' : 'messenger'
  }
  return null
}

export type InboxCategory = 'whatsapp' | 'messenger' | 'instagram'

// A WhatsApp number a parent has a chat on, and when that chat began.
export type ContactedNumber = { inboxId: number; label: string; since: number }

// The numbers a parent has written to, in the order the chats on them began: the first number they
// reached the school on, then the second, and so on.
export function numbersContacted(
  chats: { id: number; inbox_id: number; created_at?: number }[],
  labelOf: (inboxId: number) => string | null,
): ContactedNumber[] {
  const first = new Map<number, { id: number; at: number }>()
  for (const chat of chats) {
    const at = chat.created_at ?? 0
    const known = first.get(chat.inbox_id)
    if (!known || at < known.at || (at === known.at && chat.id < known.id)) {
      first.set(chat.inbox_id, { id: chat.id, at })
    }
  }
  return [...first.entries()]
    .sort(([, a], [, b]) => a.at - b.at || a.id - b.id)
    .map(([inboxId, { at }]) => ({ inboxId, label: labelOf(inboxId) ?? `Number ${inboxId}`, since: at }))
}

// The part of the inbox a chat is shown under: WhatsApp unless it came in through Messenger or Instagram.
export function categoryOf(conversation: Pick<ChatwootConversation, 'meta'>): InboxCategory {
  return socialKindOf(conversation.meta.channel, conversation.meta.sender) ?? 'whatsapp'
}

// The part of the inbox that opens first: WhatsApp, unless the school has no WhatsApp chat at all (a school that
// only answers on Messenger) - then the part that has the most chats, Messenger before Instagram on a tie.
export function firstCategory(conversations: Pick<ChatwootConversation, 'meta'>[]): InboxCategory {
  const counts: Record<InboxCategory, number> = { whatsapp: 0, messenger: 0, instagram: 0 }
  for (const conversation of conversations) {
    counts[categoryOf(conversation)] += 1
  }
  if (counts.whatsapp > 0) {
    return 'whatsapp'
  }
  if (counts.messenger === 0 && counts.instagram === 0) {
    return 'whatsapp'
  }
  return counts.instagram > counts.messenger ? 'instagram' : 'messenger'
}

export type ChatIdentity = {
  // The name the person gave WhatsApp, or null when there is none. For matching only, never shown.
  name: string | null
  title: string
  // The number, or a plain reason there is none.
  subtitle: string
  hasRealPhone: boolean
  initials: string
  // A WhatsApp group: everybody in it reads what the team writes.
  isGroup: boolean
}

// A chat is called by the parent name on its lead (what the team writes, such as the parent's
// @username), else by the phone number, else "WhatsApp user". The name the person gave
// WhatsApp is never shown; `name` keeps it only so a chat can be matched to a lead.
export function getChatIdentity(
  sender: ChatwootSender,
  leadName?: string | null,
  // The kind of inbox the chat is in; a Messenger or Instagram chat is treated differently.
  channel?: string | null,
): ChatIdentity {
  const social = socialKindOf(channel, sender)
  if (social) {
    const name = (sender.name ?? '').trim()
    return {
      name: name || null,
      title: leadName?.trim() || name || (social === 'instagram' ? 'Instagram user' : 'Messenger user'),
      subtitle: social === 'instagram' ? 'Instagram' : 'Facebook Messenger',
      hasRealPhone: true,
      initials: name ? getInitials(name) : '?',
      isGroup: false,
    }
  }
  if (isGroupChat(sender)) {
    const subject = (sender.name ?? '').replace(/\s*\(group\)\s*$/i, '').trim()
    return {
      name: subject || null,
      title: `${subject || 'WhatsApp group'} (group)`,
      subtitle: 'WhatsApp group',
      hasRealPhone: true,
      initials: subject ? getInitials(subject) : '?',
      isGroup: true,
    }
  }
  const phone = getRealPhone(sender.phone_number)
  // The helper that adds numbers to names writes "Name +60123456789".
  const cleanName = (sender.name ?? '').replace(/\s*\+\d{10,12}$/, '').trim()
  const nameIsJustDigits = /^\+?\d+$/.test(cleanName)
  const hasName = cleanName.length > 0 && !nameIsJustDigits

  const ownName = leadName?.trim() ?? ''
  const title = ownName || (phone ? formatPhone(phone) : UNNAMED_CHAT)
  const subtitle = phone ? formatPhone(phone) : 'Number hidden by WhatsApp'
  // The picture is the initials of the WhatsApp name, never the number.
  const initials = hasName ? getInitials(cleanName) : '?'

  return { name: hasName ? cleanName : null, title, subtitle, hasRealPhone: phone !== null, initials, isGroup: false }
}

// False for a chat on a WhatsApp number this person is not given. `allowed` is null when nothing is
// restricted (see useWhatsAppNumbers).
export function isOnAllowedNumber(conversation: Pick<ChatwootConversation, 'inbox_id'>, allowed: number[] | null) {
  return allowed === null || (conversation.inbox_id !== undefined && allowed.includes(conversation.inbox_id))
}

export function getTab(conversation: Pick<ChatwootConversation, 'status'>): 'chats' | 'done' {
  return conversation.status === 'resolved' ? 'done' : 'chats'
}

function isInTab(conversation: Pick<ChatwootConversation, 'status' | 'unread_count'>, tab: InboxTab) {
  if (tab === 'unread') {
    return conversation.status !== 'resolved' && conversation.unread_count > 0
  }
  return getTab(conversation) === tab
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

// Who the team said is on the other end of this chat, if anyone did.
export function getChatRole(conversation: Pick<ChatwootConversation, 'custom_attributes'>): ChatRole | null {
  const role = conversation.custom_attributes?.crm_chat_role
  return role === 'parent' || role === 'student' ? role : null
}

// The students the team tied to this chat by hand.
export function getLinkedStudentIds(conversation: Pick<ChatwootConversation, 'custom_attributes'>) {
  const ids = conversation.custom_attributes?.crm_student_ids
  if (!Array.isArray(ids)) {
    return []
  }
  return ids.map(Number).filter((id) => Number.isFinite(id))
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
  const text = withoutEditHeading(message.content).trim()
  if (text) {
    // A message that is only a link to a photo, voice message or video says what it is.
    return linkedMediaLabel(text) ?? text
  }
  const attachment = message.attachments?.[0]
  return attachment ? attachmentLabel(attachment) : ''
}

export type InboxFilters = {
  tab: InboxTab
  search: string
  // Only chats of a lead that carries this tag, or came from this source.
  tagId: number | null
  sourceId: number | null
  // Chats whose messages contain the search words (found by the server).
  matchedIds?: ReadonlySet<number>
  // Only chats whose parent has a student of this kind, or none yet.
  kind?: StudentKind | 'none' | null
  // Only chats this staff member took (their CRM user id), or 'none' for chats nobody has taken.
  ownerId?: number | 'none' | null
  // Only chats on this WhatsApp number (Chatwoot inbox id).
  inboxId?: number | null
  // Only WhatsApp chats, only Messenger chats or only Instagram chats.
  category?: InboxCategory | null
}

// The lead a chat belongs to, for the tag and source filters.
export type LeadOfChat = (
  conversation: ChatwootConversation,
) => { tagIds: number[]; sourceId: number | null; fullName?: string | null } | null

// The name or number that makes the chat this person, when the search fits it: the WhatsApp name, the lead,
// every name the team knows the chat by (the parent, the children and the students) or the phone. Null when
// only the words said in the messages could fit. The words said are a different kind of match.
export function chatIdentityMatch(
  conversation: ChatwootConversation,
  search: string,
  leadOf: LeadOfChat = () => null,
  namesOf: (conversation: ChatwootConversation) => string[] = () => [],
): string | null {
  const query = search.trim().toLowerCase()
  if (!query) {
    return null
  }
  const digitsQuery = query.replace(/\D/g, '')
  // Spaces and punctuation do not matter: "yu ni" finds "Yu-Ni" and "YuNi".
  const squash = (text: string) => text.toLowerCase().replace(/[\s\p{P}]/gu, '')
  const squashedQuery = squash(query)
  const sender = conversation.meta.sender
  // The helper that adds numbers to names writes "Name +60123456789".
  const name = (sender.name ?? '').replace(/\s*\+\d{10,12}$/, '').trim()
  if (name !== '' && name.toLowerCase().includes(query)) {
    return name
  }
  const leadName = (leadOf(conversation)?.fullName ?? '').trim()
  if (leadName !== '' && leadName.toLowerCase().includes(query)) {
    return leadName
  }
  if (squashedQuery !== '') {
    const known = namesOf(conversation).find((entry) => entry.toLowerCase().includes(query) || squash(entry).includes(squashedQuery))
    if (known !== undefined) {
      return known
    }
  }
  const phone = (sender.phone_number ?? '').replace(/\D/g, '')
  if (digitsQuery.length >= 3 && phone.includes(digitsQuery)) {
    return formatPhone(phone)
  }
  return null
}

export function matchesChatIdentity(
  conversation: ChatwootConversation,
  search: string,
  leadOf: LeadOfChat = () => null,
  namesOf: (conversation: ChatwootConversation) => string[] = () => [],
) {
  return chatIdentityMatch(conversation, search, leadOf, namesOf) !== null
}

export function filterConversations(
  conversations: ChatwootConversation[],
  filters: InboxFilters,
  leadOf: LeadOfChat = () => null,
  kindsOf: (conversation: ChatwootConversation) => StudentKind[] = () => [],
  // Every name the team knows this chat by: the label in the list, the parent, the children and the
  // students. Searched together with the WhatsApp name, so "poh" finds "Poh Yu Ni (child)".
  namesOf: (conversation: ChatwootConversation) => string[] = () => [],
) {
  const query = filters.search.trim().toLowerCase()

  const found = conversations
    .filter((conversation) => isInTab(conversation, filters.tab))
    .filter((conversation) => {
      if (filters.tagId === null && filters.sourceId === null) {
        return true
      }
      const lead = leadOf(conversation)
      if (!lead) {
        return false
      }
      return (
        (filters.tagId === null || lead.tagIds.includes(filters.tagId)) &&
        (filters.sourceId === null || lead.sourceId === filters.sourceId)
      )
    })
    .filter((conversation) => !filters.category || categoryOf(conversation) === filters.category)
    .filter((conversation) => filters.inboxId === null || filters.inboxId === undefined || conversation.inbox_id === filters.inboxId)
    .filter((conversation) => {
      if (filters.ownerId === null || filters.ownerId === undefined) {
        return true
      }
      const owner = getOwner(conversation)
      return filters.ownerId === 'none' ? owner === null : owner?.id === filters.ownerId
    })
    .filter((conversation) => {
      if (!filters.kind) {
        return true
      }
      const kinds = kindsOf(conversation)
      return filters.kind === 'none' ? kinds.length === 0 : kinds.includes(filters.kind)
    })
    .filter((conversation) => {
      if (!query) {
        return true
      }
      return (
        matchesChatIdentity(conversation, query, leadOf, namesOf) ||
        filters.matchedIds?.has(conversation.id) === true ||
        getPreview(conversation).toLowerCase().includes(query)
      )
    })

  // Like WhatsApp: the people whose name or number fits come first, then the chats where the words were said.
  // Each group keeps the newest chat on top.
  const byActivity = (a: ChatwootConversation, b: ChatwootConversation) => b.last_activity_at - a.last_activity_at
  if (!query) {
    return found.sort(byActivity)
  }
  const people = found.filter((conversation) => matchesChatIdentity(conversation, query, leadOf, namesOf)).sort(byActivity)
  const inPeople = new Set(people.map((conversation) => conversation.id))
  return [...people, ...found.filter((conversation) => !inPeople.has(conversation.id)).sort(byActivity)]
}

export function countByTab(conversations: ChatwootConversation[]) {
  const counts: Record<InboxTab, number> = { chats: 0, unread: 0, done: 0 }
  for (const conversation of conversations) {
    counts[getTab(conversation)] += 1
    if (isInTab(conversation, 'unread')) {
      counts.unread += 1
    }
  }
  return counts
}

// How many chats nobody has looked at yet there are in each part of the inbox.
export function unreadByCategory(conversations: ChatwootConversation[]) {
  const counts: Record<InboxCategory, number> = { whatsapp: 0, messenger: 0, instagram: 0 }
  for (const conversation of conversations) {
    if (isInTab(conversation, 'unread')) {
      counts[categoryOf(conversation)] += 1
    }
  }
  return counts
}

// One chat per parent. WhatsApp can leave an old chat under a hidden ID beside the one with
// the phone number. Once Chatwoot has merged the two contacts they share a sender id, and the
// chat with the newest message stands for the parent; the older ones are read through it.
// Only chats on the same WhatsApp number are one chat: a parent who writes to number A and to number B
// has a chat on each, and each number keeps its own.
// A chat that has no lead written on it in Chatwoot, but whose contact the database already ties to a lead (a lead made by
// itself from a chat with a hidden number has no phone to find it by), is shown with that lead.
export function withLeadLink(conversation: ChatwootConversation, leadOfContact?: Map<number, number>): ChatwootConversation {
  if (!leadOfContact || getLinkedLeadId(conversation) !== null) {
    return conversation
  }
  const leadId = leadOfContact.get(conversation.meta.sender.id)
  return leadId === undefined
    ? conversation
    : { ...conversation, custom_attributes: { ...conversation.custom_attributes, crm_lead_id: leadId } }
}

// siblings: a person who writes from two WhatsApp identities (their phone number and WhatsApp's hidden ID) has two
// contacts. When the CRM knows they are one person (the same lead), each contact maps to all of them and their chats
// count as one.
export function onePerParent(conversations: ChatwootConversation[], siblings?: Map<number, number[]>) {
  const personOf = (contactId: number) => {
    const same = siblings?.get(contactId)
    return same && same.length > 0 ? Math.min(...same) : contactId
  }
  const keyOf = (conversation: ChatwootConversation) =>
    `${personOf(conversation.meta.sender.id)}:${conversation.inbox_id ?? 0}`
  const newest = new Map<string, ChatwootConversation>()
  for (const conversation of conversations) {
    const key = keyOf(conversation)
    const current = newest.get(key)
    if (!current || conversation.last_activity_at > current.last_activity_at) {
      newest.set(key, conversation)
    }
  }
  return conversations.filter((conversation) => newest.get(keyOf(conversation)) === conversation)
}

// WhatsApp keeps at most 3 messages pinned in a chat; a fourth takes the place of the oldest.
export const MAX_PINNED_MESSAGES = 3

export function togglePinnedMessage(pinned: number[] | undefined, messageId: number) {
  const list = pinned ?? []
  return list.includes(messageId)
    ? list.filter((id) => id !== messageId)
    : [messageId, ...list].slice(0, MAX_PINNED_MESSAGES)
}

export type UnreadCounts = { total: number; byCategory: Record<InboxCategory, number> }

// Chats nobody has looked at yet, over EVERY open chat, the same way for the menu badge, Today and the Inbox's
// WhatsApp / Messenger / Instagram buttons. `everyOpen` is the whole list of open chats (read now and then, all
// pages); `fresher` are chats read since (the Inbox's own list), which take the place of their older copies.
// Counting only the chats already shown would miss the ones further down (EduHero: 822 unread, 48 shown).
export function countUnreadAcross(
  everyOpen: ChatwootConversation[],
  fresher: ChatwootConversation[],
  allowedInboxIds: number[] | null,
  siblings?: Map<number, number[]>,
): UnreadCounts {
  const byId = new Map(everyOpen.map((conversation) => [conversation.id, conversation]))
  for (const conversation of fresher) {
    byId.set(conversation.id, conversation)
  }
  const byCategory = unreadByCategory(
    onePerParent(
      [...byId.values()].filter((conversation) => isOnAllowedNumber(conversation, allowedInboxIds)),
      siblings,
    ),
  )
  return { total: byCategory.whatsapp + byCategory.messenger + byCategory.instagram, byCategory }
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

// A reply through GoHighLevel never gets a WhatsApp-style id back; its bridge only says so when it failed,
// so such a message counts as sent once this many seconds passed without that.
export const SOCIAL_CONFIRM_SECONDS = 4

// Whether a chat's replies come back with an id of their own (WhatsApp, Messenger through our Meta app).
// The GoHighLevel bridge's chats ("ghl:<id>") do not.
export function confirmsBySource(sender?: ChatwootSender | null) {
  return !sender?.identifier?.startsWith('ghl:')
}

// Whether a message has really reached WhatsApp. A message we sent only counts
// as sent once WhatsApp gave it an id.
export function getSendState(
  message: ChatwootMessage,
  nowSeconds: number,
  // False in a chat whose replies never get an id: then "not failed for a few seconds" is sent.
  idConfirms = true,
): SendState {
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
  if (!idConfirms) {
    return nowSeconds - message.created_at >= SOCIAL_CONFIRM_SECONDS ? 'sent' : 'sending'
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
