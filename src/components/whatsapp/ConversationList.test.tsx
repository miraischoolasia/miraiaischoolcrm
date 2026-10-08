import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatwootConversation } from '../../lib/whatsappInbox'
import { ConversationList } from './ConversationList'

const NOW = 1_800_000_000

const chat = (id: number, name: string, waitingFor: number): ChatwootConversation => ({
  id,
  status: 'open',
  unread_count: 1,
  waiting_since: NOW - waitingFor,
  timestamp: NOW - waitingFor,
  last_activity_at: NOW - waitingFor,
  meta: { sender: { id, name, phone_number: '+60123456789', identifier: null } },
  last_non_activity_message: { id, content: 'hello', message_type: 0, created_at: NOW - waitingFor, private: false, status: 'sent' },
})

function renderList(conversations: ChatwootConversation[], overdueCount: number) {
  render(
    <ConversationList
      conversations={conversations}
      counts={{ chats: conversations.length, done: 0 }}
      hasMoreOpen={false}
      tab="chats"
      owner="everyone"
      search=""
      selectedId={null}
      nowSeconds={NOW}
      waitingCount={conversations.length}
      overdueCount={overdueCount}
      isLoading={false}
      loadError={null}
      canLoadMore={false}
      onTab={vi.fn()}
      onOwner={vi.fn()}
      onSearch={vi.fn()}
      onSelect={vi.fn()}
      onLoadMore={vi.fn()}
    />,
  )
}

describe('ConversationList waiting too long', () => {
  it('marks a chat that has waited 30 minutes or more, and says how long', () => {
    renderList([chat(1, 'Mei Ling', 45 * 60), chat(2, 'Aisha', 5 * 60)], 1)

    expect(screen.getByText('Waiting 45 min')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting 5 min/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 chat has waited over 30 minutes for a reply.')
  })

  it('tells a chat waiting under 30 minutes needs a reply, and shows the waiting count on the Chats tab', () => {
    renderList([chat(1, 'Aisha', 5 * 60)], 0)

    expect(screen.getByText('Needs reply')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chats, 1, 1 waiting' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /In progress|To reply/ })).not.toBeInTheDocument()
  })

  it('shows no warning when nobody is late', () => {
    renderList([chat(1, 'Aisha', 5 * 60)], 0)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('labels an old chat with its age but does not paint the row red', () => {
    renderList([chat(1, 'Old chat', 3 * 86400)], 0)

    expect(screen.getByText('Waiting 3 d')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Old chat/ }).className).not.toContain('bg-red-50')
  })
})
