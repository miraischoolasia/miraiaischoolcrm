import type { ChatwootClient } from './chatwootClient'

// Starting a chat with someone who has not written first: the number is turned
// into a contact and a conversation, or an existing one is opened.

// 012 345 6789, +60 12-345 6789, 0060 12-345 6789 and 12-345 6789 (the 0 left off) all become 60123456789, and a
// Singapore number of 8 digits gets 65. Null when it cannot be a number.
export function normalizePhoneInput(raw: string) {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) {
    // 0060... is how a number is written with the international prefix.
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    digits = `60${digits.slice(1)}`
  } else if (/^1\d{8,9}$/.test(digits)) {
    // A Malaysian mobile number typed without its 0, which would otherwise be read as a US number.
    digits = `60${digits}`
  } else if (/^[89]\d{7}$/.test(digits)) {
    digits = `65${digits}`
  }
  if (digits.length < 9 || digits.length > 13) {
    return null
  }
  return digits
}

type FindChatClient = Pick<ChatwootClient, 'getInboxId' | 'findContactByPhone' | 'listContactConversations'>

// Whether a chat with this number exists already, without making one. Null when
// there is none, or when the number cannot be a number.
export async function findChatByPhone(client: FindChatClient, phone: string): Promise<number | null> {
  const digits = normalizePhoneInput(phone)
  if (!digits) {
    return null
  }
  const contact = await client.findContactByPhone(digits)
  if (!contact) {
    return null
  }
  const inboxId = await client.getInboxId()
  const existing = (await client.listContactConversations(contact.id))
    .filter((conversation) => conversation.inbox_id === inboxId)
    .sort((a, b) => b.id - a.id)
  return (existing.find((conversation) => conversation.status !== 'resolved') ?? existing[0])?.id ?? null
}

export type StartChatResult =
  | { conversationId: number; created: boolean; reopened: boolean; error: null }
  | { conversationId: null; created: false; reopened: false; error: string }

type StartChatClient = Pick<
  ChatwootClient,
  'getInboxId' | 'findContactByPhone' | 'createContact' | 'listContactConversations' | 'createConversation' | 'setStatus'
>

// Opens the chat with this number: the open one if there is one, the latest
// finished one (reopened) otherwise, and a new one when the number is new.
export async function startChat(
  client: StartChatClient,
  // inboxId: the WhatsApp number to write from; the school's first inbox when not given.
  input: { phone: string; name: string; inboxId?: number | null },
): Promise<StartChatResult> {
  const digits = normalizePhoneInput(input.phone)
  if (!digits) {
    return { conversationId: null, created: false, reopened: false, error: 'Enter the full number, for example 012 345 6789.' }
  }

  try {
    const inboxId = input.inboxId ?? (await client.getInboxId())
    const contact =
      (await client.findContactByPhone(digits)) ?? (await client.createContact(inboxId, digits, input.name.trim()))

    const existing = (await client.listContactConversations(contact.id))
      .filter((conversation) => conversation.inbox_id === inboxId)
      .sort((a, b) => b.id - a.id)
    const open = existing.find((conversation) => conversation.status !== 'resolved')
    if (open) {
      return { conversationId: open.id, created: false, reopened: false, error: null }
    }
    if (existing[0]) {
      await client.setStatus(existing[0].id, 'open')
      return { conversationId: existing[0].id, created: false, reopened: true, error: null }
    }

    const conversation = await client.createConversation(contact.id, inboxId)
    return { conversationId: conversation.id, created: true, reopened: false, error: null }
  } catch {
    return { conversationId: null, created: false, reopened: false, error: "Couldn't start the chat. Check the connection and try again." }
  }
}
