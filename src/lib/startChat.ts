import type { ChatwootClient } from './chatwootClient'

// Starting a chat with someone who has not written first: the number is turned
// into a contact and a conversation, or an existing one is opened.

// 012 345 6789 and +60 12-345 6789 both become 60123456789. Null when it cannot be a number.
export function normalizePhoneInput(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 13) {
    return null
  }
  return digits.startsWith('0') ? `60${digits.slice(1)}` : digits
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
  input: { phone: string; name: string },
): Promise<StartChatResult> {
  const digits = normalizePhoneInput(input.phone)
  if (!digits) {
    return { conversationId: null, created: false, reopened: false, error: 'Enter the full number, for example 012 345 6789.' }
  }

  try {
    const inboxId = await client.getInboxId()
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
