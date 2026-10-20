import type { LeadChannel, LeadChannelKind } from './leadChannels'
import { getChatRole, getRealPhone, type ChatwootConversation } from './whatsappInbox'

// The chats of one family (a lead) to switch between above the reply box: WhatsApp on each of the school's
// numbers, Messenger on each Page, Instagram, and a child who writes from their own number. Picking one opens
// that chat, so the reply goes out from there.

export type ChatSwitchOption = {
  key: string
  kind: LeadChannelKind
  // The chat to open; null when only the contact is known (the newest chat of the contact is opened).
  conversationId: number | null
  contactId: number
  // Where the reply goes out from: "Mirai WhatsApp · 012-345 6789", "Messenger: Jack老师".
  account: string
  // Who is on the other side: the name on that channel, or "Child Lucas" for a child's own number.
  who: string | null
  isChild: boolean
  // The last message, in seconds; null when the chat is not loaded.
  lastAt: number | null
  current: boolean
}

type Candidate = { kind: LeadChannelKind; contactId: number; inboxId: number; conversation: ChatwootConversation | null; row: LeadChannel | null }

export type ChatSwitchSources = {
  // The family's rows in lead_channels.
  rows: LeadChannel[]
  // The chats loaded in the inbox that belong to this family (linked to the lead, or a contact of the rows).
  conversations: ChatwootConversation[]
  // The chat open now.
  current: ChatwootConversation
  kindOf: (conversation: ChatwootConversation) => LeadChannelKind
  // Where a loaded chat's reply goes out from (the same words as the "Sending from" label).
  accountOfChat: (conversation: ChatwootConversation) => string
  // The same for a chat that is not loaded, from its lead_channels row.
  accountOfRow: (row: LeadChannel) => string
  // The children a chat is tied to, by name ("Lucas").
  childNamesOf: (conversation: ChatwootConversation) => string[]
  // The numbers / Pages this account may use; null for every one.
  allowedInboxIds: number[] | null
}

export function chatSwitchOptions(sources: ChatSwitchSources): ChatSwitchOption[] {
  const { rows, current, allowedInboxIds } = sources
  const byKey = new Map<string, Candidate>()
  const keyOf = (contactId: number, inboxId: number) => `${contactId}:${inboxId}`
  const add = (candidate: Candidate) => {
    const key = keyOf(candidate.contactId, candidate.inboxId)
    const known = byKey.get(key)
    if (!known) {
      byKey.set(key, candidate)
      return
    }
    // One contact on one number can have an older chat too: keep the newest, and always the one open now.
    const keepNew =
      candidate.conversation !== null &&
      (known.conversation === null ||
        candidate.conversation.id === current.id ||
        (known.conversation.id !== current.id && (candidate.conversation.last_activity_at ?? 0) > (known.conversation.last_activity_at ?? 0)))
    byKey.set(key, keepNew ? { ...candidate, row: candidate.row ?? known.row } : { ...known, row: known.row ?? candidate.row })
  }

  const conversations = [current, ...sources.conversations.filter((conversation) => conversation.id !== current.id)]
  for (const conversation of conversations) {
    const contactId = conversation.meta.sender.id
    if (contactId === undefined || contactId === null || conversation.inbox_id === undefined) continue
    add({ kind: sources.kindOf(conversation), contactId, inboxId: conversation.inbox_id, conversation, row: null })
  }
  for (const row of rows) {
    const conversation =
      conversations.find((entry) => row.conversationId !== null && entry.id === row.conversationId) ?? null
    add({ kind: row.channel, contactId: row.contactId, inboxId: row.inboxId, conversation, row })
  }

  let candidates = [...byKey.values()].filter(
    (candidate) => allowedInboxIds === null || allowedInboxIds.includes(candidate.inboxId) || candidate.conversation?.id === current.id,
  )

  // WhatsApp can show one person as two contacts on one number (the phone number, and a hidden ID instead of it).
  // A contact without a real number on a number where the family has one is that same person, unless it is a
  // child's own chat.
  candidates = candidates.filter((candidate) => {
    if (candidate.kind !== 'whatsapp' || candidate.conversation?.id === current.id) return true
    const phone = candidate.conversation ? getRealPhone(candidate.conversation.meta.sender.phone_number) : null
    if (phone || (candidate.conversation && getChatRole(candidate.conversation) === 'student')) return true
    return !candidates.some(
      (other) =>
        other !== candidate &&
        other.kind === 'whatsapp' &&
        other.inboxId === candidate.inboxId &&
        other.conversation !== null &&
        getRealPhone(other.conversation.meta.sender.phone_number) !== null,
    )
  })

  const order: LeadChannelKind[] = ['whatsapp', 'messenger', 'instagram']
  return candidates
    .map((candidate): ChatSwitchOption => {
      const { conversation, row } = candidate
      const isChild = conversation !== null && getChatRole(conversation) === 'student'
      const children = isChild && conversation ? sources.childNamesOf(conversation) : []
      const name = conversation?.meta.sender.name?.trim() || row?.name?.trim() || null
      return {
        key: `${candidate.contactId}:${candidate.inboxId}`,
        kind: candidate.kind,
        conversationId: conversation?.id ?? row?.conversationId ?? null,
        contactId: candidate.contactId,
        account: conversation ? sources.accountOfChat(conversation) : sources.accountOfRow(row!),
        who: isChild ? `Child ${children.length > 0 ? children.join(' & ') : (name ?? '')}`.trim() : name,
        isChild,
        lastAt: conversation?.last_activity_at ?? null,
        current: conversation?.id === current.id,
      }
    })
    .sort(
      (a, b) =>
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        Number(a.isChild) - Number(b.isChild) ||
        (b.lastAt ?? 0) - (a.lastAt ?? 0) ||
        a.key.localeCompare(b.key),
    )
}
