import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function renderList(
  conversations: ChatwootConversation[],
  overdueCount: number,
  extra: Partial<React.ComponentProps<typeof ConversationList>> = {},
) {
  render(
    <ConversationList
      conversations={conversations}
      counts={{ chats: conversations.length, unread: conversations.length, done: 0 }}
      hasMoreOpen={false}
      tab="chats"
      search=""
      tagId={null}
      sourceId={null}
      tags={[]}
      sources={[]}
      snippets={new Map()}
      selectedId={null}
      nowSeconds={NOW}
      overdueCount={overdueCount}
      isLoading={false}
      loadError={null}
      canLoadMore={false}
      onTab={vi.fn()}
      onTag={vi.fn()}
      onSource={vi.fn()}
      onSearch={vi.fn()}
      onSelect={vi.fn()}
      onLoadMore={vi.fn()}
      onNewChat={vi.fn()}
      {...extra}
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

  it('tells a chat waiting under 30 minutes needs a reply, and has Chats, Unread and Done tabs', () => {
    renderList([chat(1, 'Aisha', 5 * 60)], 0)

    expect(screen.getByText('Needs reply')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chats, 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unread, 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done, 0' })).toBeInTheDocument()
    expect(screen.queryByText(/Every chat that is not finished/)).not.toBeInTheDocument()
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

describe('ConversationList filters and search', () => {
  const option = (id: number, kind: 'tag' | 'source', label: string) => ({ id, kind, label, isActive: true, legacyKey: null, color: null })

  it('offers the tags and the sources, and reports the one picked', async () => {
    const onTag = vi.fn()
    const onSource = vi.fn()
    renderList([chat(1, 'Aisha', 60)], 0, {
      tags: [option(10, 'tag', 'Free HOA')],
      sources: [option(5, 'source', 'Facebook')],
      onTag,
      onSource,
    })

    await userEvent.selectOptions(screen.getByLabelText('Filter by tag'), '10')
    await userEvent.selectOptions(screen.getByLabelText('Filter by source'), '5')

    expect(onTag).toHaveBeenCalledWith(10)
    expect(onSource).toHaveBeenCalledWith(5)
    expect(screen.queryByText(/Show: Everyone/)).not.toBeInTheDocument()
  })

  it('explains a filter and clears both with one click', async () => {
    const onTag = vi.fn()
    const onSource = vi.fn()
    renderList([chat(1, 'Aisha', 60)], 0, { tagId: 10, tags: [option(10, 'tag', 'Free HOA')], onTag, onSource })

    expect(screen.getByText(/Only chats tied to a lead are shown/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onTag).toHaveBeenCalledWith(null)
    expect(onSource).toHaveBeenCalledWith(null)
  })

  it('shows the message that matched the search in place of the last message', () => {
    renderList([chat(1, 'Aisha', 60)], 0, { snippets: new Map([[1, 'The fees are RM100']]) })

    expect(screen.getByText('The fees are RM100')).toBeInTheDocument()
    expect(screen.getByText('Found:')).toBeInTheDocument()
  })
})
