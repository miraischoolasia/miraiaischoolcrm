import type { ChatwootConversation, ChatwootMessage } from './whatsappInbox'

// Talks to Chatwoot through the school's gateway, which adds the secret key.
// The browser never holds that key.

export type ConversationPage = {
  conversations: ChatwootConversation[]
  totalCount: number
}

export type Sender = { id: number; name: string }

export type ChatwootClient = ReturnType<typeof createChatwootClient>

export function createChatwootClient(apiUrl: string, accountId = '1') {
  const base = `${apiUrl}/api/v1/accounts/${accountId}`

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${path}`, init)
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

    async setOwner(conversationId: number, owner: Sender | null) {
      await request(
        `/conversations/${conversationId}/custom_attributes`,
        json('POST', {
          custom_attributes: { crm_owner_id: owner?.id ?? null, crm_owner_name: owner?.name ?? null },
        }),
      )
    },

    async setStatus(conversationId: number, status: 'open' | 'resolved') {
      await request(`/conversations/${conversationId}/toggle_status`, json('POST', { status }))
    },

    async markSeen(conversationId: number) {
      await request(`/conversations/${conversationId}/update_last_seen`, { method: 'POST' })
    },

    async setContactPhone(contactId: number, digits: string) {
      await request(`/contacts/${contactId}`, json('PUT', { phone_number: `+${digits}` }))
    },
  }
}
