import { getSupabaseAccessToken } from './accessToken'
import type { ChatAttributes, ChatwootConversation, ChatwootMessage } from './whatsappInbox'

// Talks to Chatwoot through the school's gateway, which checks the login and adds
// the secret key. The browser never holds that key.

export type ConversationPage = {
  conversations: ChatwootConversation[]
  totalCount: number
}

export type Sender = { id: number; name: string }

export type ChatwootClient = ReturnType<typeof createChatwootClient>

export function createChatwootClient(
  apiUrl: string,
  accountId = '1',
  getAccessToken: () => Promise<string | null> = getSupabaseAccessToken,
) {
  const base = `${apiUrl}/api/v1/accounts/${accountId}`

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    // The gateway lets a request through only for someone signed in who may see Leads.
    const token = await getAccessToken()
    const headers = new Headers(init.headers)
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const response = await fetch(`${base}${path}`, { ...init, headers })
    if (!response.ok) {
      throw new Error(`WhatsApp inbox request failed (${response.status})`)
    }
    const text = await response.text()
    return (text ? JSON.parse(text) : null) as T
  }

  function json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  }

  return {
    async listConversations(status: 'open' | 'resolved', page = 1): Promise<ConversationPage> {
      const data = await request<{ data: { payload: ChatwootConversation[]; meta: { all_count: number } } }>(
        `/conversations?status=${status}&assignee_type=all&page=${page}`,
      )
      return { conversations: data.data.payload, totalCount: data.data.meta.all_count }
    },

    async listMessages(conversationId: number, before?: number): Promise<ChatwootMessage[]> {
      const query = before ? `?before=${before}` : ''
      const data = await request<{ payload: ChatwootMessage[] }>(`/conversations/${conversationId}/messages${query}`)
      return data.payload
    },

    async sendMessage(
      conversationId: number,
      input: { content: string; isPrivate: boolean; files: File[]; sender: Sender },
    ): Promise<ChatwootMessage> {
      const path = `/conversations/${conversationId}/messages`
      if (input.files.length === 0) {
        return request<ChatwootMessage>(
          path,
          json('POST', {
            content: input.content,
            private: input.isPrivate,
            message_type: 'outgoing',
            content_attributes: { crm_sender: input.sender },
          }),
        )
      }

      const form = new FormData()
      form.append('content', input.content)
      form.append('private', String(input.isPrivate))
      form.append('message_type', 'outgoing')
      form.append('content_attributes[crm_sender][id]', String(input.sender.id))
      form.append('content_attributes[crm_sender][name]', input.sender.name)
      for (const file of input.files) {
        form.append('attachments[]', file, file.name)
      }
      return request<ChatwootMessage>(path, { method: 'POST', body: form })
    },

    // Chatwoot swaps in whatever it is given, so callers pass the complete set.
    async setAttributes(conversationId: number, attributes: ChatAttributes) {
      await request(`/conversations/${conversationId}/custom_attributes`, json('POST', { custom_attributes: attributes }))
    },

    async setStatus(conversationId: number, status: 'open' | 'resolved') {
      await request(`/conversations/${conversationId}/toggle_status`, json('POST', { status }))
    },

    // Puts the chat back to "nobody has opened it", the way a phone does.
    async markUnread(conversationId: number) {
      await request(`/conversations/${conversationId}/unread`, { method: 'POST' })
    },

    async markSeen(conversationId: number) {
      await request(`/conversations/${conversationId}/update_last_seen`, { method: 'POST' })
    },

    // Chats with a message containing these words, and the message that matched.
    async searchMessages(query: string): Promise<{ conversationId: number; snippet: string }[]> {
      const data = await request<{ payload: { id: number; messages?: { content: string | null }[] }[] }>(
        `/conversations/search?q=${encodeURIComponent(query)}&page=1`,
      )
      return data.payload.map((item) => ({ conversationId: item.id, snippet: (item.messages?.[0]?.content ?? '').trim() }))
    },

    async getConversation(conversationId: number): Promise<ChatwootConversation> {
      return request<ChatwootConversation>(`/conversations/${conversationId}`)
    },

    // The WhatsApp inbox: where new chats are created.
    async getInboxId(): Promise<number> {
      const data = await request<{ payload: { id: number; channel_type: string }[] }>('/inboxes')
      const inbox = data.payload.find((entry) => entry.channel_type === 'Channel::Api') ?? data.payload[0]
      if (!inbox) {
        throw new Error('No WhatsApp inbox found')
      }
      return inbox.id
    },

    async findContactByPhone(digits: string): Promise<{ id: number } | null> {
      const data = await request<{ payload: { id: number; phone_number: string | null; identifier: string | null }[] }>(
        `/contacts/search?q=${digits}`,
      )
      const match = data.payload.find(
        (contact) =>
          (contact.phone_number ?? '').replace(/\D/g, '') === digits || (contact.identifier ?? '').startsWith(`${digits}@`),
      )
      return match ? { id: match.id } : null
    },

    // The identifier is the WhatsApp address, so a reply from this number lands in the same contact.
    async createContact(inboxId: number, digits: string, name: string): Promise<{ id: number }> {
      const data = await request<{ payload: { contact?: { id: number }; id?: number } }>(
        '/contacts',
        json('POST', {
          inbox_id: inboxId,
          name: name || `+${digits}`,
          phone_number: `+${digits}`,
          identifier: `${digits}@s.whatsapp.net`,
        }),
      )
      const id = data.payload.contact?.id ?? data.payload.id
      if (!id) {
        throw new Error('Contact was not created')
      }
      return { id }
    },

    async listContactConversations(contactId: number): Promise<{ id: number; status: string; inbox_id: number }[]> {
      const data = await request<{ payload: { id: number; status: string; inbox_id: number }[] }>(
        `/contacts/${contactId}/conversations`,
      )
      return data.payload
    },

    async createConversation(contactId: number, inboxId: number): Promise<{ id: number }> {
      return request<{ id: number }>('/conversations', json('POST', { contact_id: contactId, inbox_id: inboxId }))
    },
  }
}
