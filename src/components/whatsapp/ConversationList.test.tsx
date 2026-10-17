import { render, screen, within } from '@testing-library/react'
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
    renderList([chat(1, 'Mei Ling', 45 * 60), chat(2, 'Aisha', 5 * 60)], 1, { showWaiting: true })

    expect(screen.getByText('Waiting 45 min')).toBeInTheDocument()
    expect(screen.queryByText(/Waiting 5 min/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 chat has waited over 30 minutes for a reply.')
  })

  it('has Chats, Unread and Done tabs, and no "Needs reply" label', () => {
    renderList([chat(1, 'Aisha', 5 * 60)], 0)

    expect(screen.queryByText('Needs reply')).not.toBeInTheDocument()
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
    renderList([chat(1, 'Old chat', 3 * 86400)], 0, { showWaiting: true })

    expect(screen.getByText('Waiting 3 d')).toBeInTheDocument()
    expect(screen.getByText('Waiting 3 d').closest('button')?.className).not.toContain('bg-red-50')
  })
})

describe('ConversationList reactions', () => {
  it('words a reaction the way WhatsApp does instead of showing only the emoji', () => {
    const reacted: ChatwootConversation = {
      ...chat(1, 'Aisha', 60),
      last_non_activity_message: {
        id: 9,
        content: '❤️',
        message_type: 1,
        created_at: NOW - 60,
        private: false,
        status: 'sent',
        source_id: 'WAID:R1',
        content_attributes: { in_reply_to: 4, in_reply_to_external_id: 'WAID:V1' },
      },
    }
    renderList([reacted], 0, { reactionPreviews: new Map([['R1', { emoji: '❤️', target: '🎤 0:11' }]]) })

    expect(screen.getByText('You reacted ❤️ to: "🎤 0:11"')).toBeInTheDocument()
    expect(screen.queryByText('You: ❤️')).not.toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
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

describe('ConversationList waiting display', () => {
  it('is hidden for now: no banner, no "Waiting" chip, no red row', () => {
    renderList([chat(1, 'Mei Ling', 45 * 60)], 1)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/Waiting/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\+60 12-345 6789/ }).className).not.toContain('bg-red-50')
  })

  it('gives every chat the same height, with or without tags', () => {
    renderList([chat(1, 'Mei Ling', 60)], 0)

    // The line under the chat is kept even when it holds nothing, so a chat without tags is as tall as one with.
    const row = screen.getByRole('button', { name: /\+60 12-345 6789/ })
    expect(row.innerHTML).toContain('min-h-[22px]')
  })
})

describe('ConversationList chat details', () => {
  it('shows the lead tags under the chat and the person in charge as a small circle by the name', () => {
    renderList([chat(1, 'Mei Ling', 60)], 0, {
      tagsOf: () => [{ id: 10, label: 'Free HOA', color: null, isActive: true }],
      picOf: () => ({ name: 'Amy Lim', initials: 'AL' }),
    })

    expect(screen.getByText('Free HOA')).toBeInTheDocument()
    expect(screen.getByTitle('In charge: Amy Lim')).toHaveTextContent('AL')
  })

  it('no longer shows a "No one yet" or "No number" chip', () => {
    renderList([chat(1, 'Mei Ling', 60)], 0)

    expect(screen.queryByText('No one yet')).not.toBeInTheDocument()
    expect(screen.queryByText('No number')).not.toBeInTheDocument()
  })

  it('shows the initials of the WhatsApp name as the picture, not the number', () => {
    renderList([chat(1, 'Mei Ling', 60)], 0)

    expect(screen.getByText('ML')).toBeInTheDocument()
  })
})

describe('ConversationList unread marks', () => {
  it('shows a pink dot, not a number, for a chat the team marked unread by hand', () => {
    renderList([{ ...chat(1, 'Mei Ling', 60), custom_attributes: { crm_marked_unread: true } }], 0)

    expect(screen.getByRole('img', { name: 'Marked as unread' })).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /12-345 6789/ })).queryByText('1')).not.toBeInTheDocument()
  })

  it('shows the number when new messages came after it was marked unread', () => {
    renderList([{ ...chat(1, 'Mei Ling', 60), unread_count: 3, custom_attributes: { crm_marked_unread: true } }], 0)

    expect(screen.queryByRole('img', { name: 'Marked as unread' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /12-345 6789/ })).getByText('3')).toBeInTheDocument()
  })

  it('shows the number for ordinary unread messages', () => {
    renderList([chat(1, 'Mei Ling', 60)], 0)

    expect(within(screen.getByRole('button', { name: /12-345 6789/ })).getByText('1')).toBeInTheDocument()
  })
})

describe('ConversationList drafts', () => {
  it('shows what was left unsent in place of the last message', () => {
    renderList([chat(1, 'Mei Ling', 60)], 0, { draftOf: () => 'See you at 2' })

    const row = screen.getByRole('button', { name: /12-345 6789/ })
    expect(within(row).getByText('Draft:')).toBeInTheDocument()
    expect(within(row).getByText(/See you at 2/)).toBeInTheDocument()
    expect(within(row).queryByText('hello')).not.toBeInTheDocument()
  })

  it('shows the last message when there is no draft', () => {
    renderList([chat(1, 'Mei Ling', 60)], 0, { draftOf: () => null })

    expect(screen.queryByText('Draft:')).not.toBeInTheDocument()
  })
})

describe('ConversationList duplicate chats of one parent', () => {
  it('says an empty chat is not the parent\'s real chat, and leaves the real one unmarked', () => {
    const real = chat(1, 'Yvonne', 5 * 60)
    const empty = { ...chat(2, 'Teoh Tze Yu', 60), last_non_activity_message: null }
    renderList([empty, real], 0, {
      isOlderDuplicate: () => false,
      isEmptyDuplicate: (conversation) => conversation.id === 2,
    })

    expect(screen.getAllByText("Empty. This parent's chat is another one")).toHaveLength(1)
    expect(screen.queryByText('Older chat of this parent')).not.toBeInTheDocument()
  })
})

describe('ConversationList student writing themself', () => {
  it('marks a chat where the student themself is on the other end', () => {
    renderList([chat(1, 'Ethan', 60), chat(2, 'Aisha', 120)], 0, { isStudentSelf: (conversation) => conversation.id === 1 })

    expect(screen.getAllByText('Student themself')).toHaveLength(1)
  })
})

describe('ConversationList filter button', () => {
  it('keeps the filters out of the way until the button is pressed', async () => {
    renderList([chat(1, 'Aisha', 60)], 0)

    expect(screen.queryByLabelText('Filter by tag')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument()
  })

  it('opens by itself while a filter is on', () => {
    renderList([chat(1, 'Aisha', 60)], 0, { tagId: 10, tags: [] })

    expect(screen.getByLabelText('Filter by tag')).toBeInTheDocument()
  })
})

const baseProps: React.ComponentProps<typeof ConversationList> = {
  conversations: [],
  counts: { chats: 0, unread: 0, done: 0 },
  hasMoreOpen: false,
  tab: 'chats',
  search: '',
  tagId: null,
  sourceId: null,
  tags: [],
  sources: [],
  snippets: new Map(),
  selectedId: null,
  nowSeconds: NOW,
  overdueCount: 0,
  isLoading: false,
  loadError: null,
  canLoadMore: false,
  onTab: vi.fn(),
  onTag: vi.fn(),
  onSource: vi.fn(),
  onSearch: vi.fn(),
  onSelect: vi.fn(),
  onLoadMore: vi.fn(),
  onNewChat: vi.fn(),
}

describe('ConversationList when there is nothing to show', () => {
  it('says what each tab means when it is empty', () => {
    const { rerender } = render(
      <ConversationList {...baseProps} conversations={[]} counts={{ chats: 0, unread: 0, done: 0 }} tab="done" />,
    )
    expect(screen.getByText(/No finished chats yet/)).toBeInTheDocument()

    rerender(<ConversationList {...baseProps} conversations={[]} counts={{ chats: 0, unread: 0, done: 0 }} tab="unread" />)
    expect(screen.getByText(/all caught up/)).toBeInTheDocument()
  })

  it('points to "Load older chats" instead of saying there is nothing, when more chats are still to load', () => {
    render(<ConversationList {...baseProps} conversations={[]} counts={{ chats: 0, unread: 0, done: 0 }} canLoadMore />)

    expect(screen.getByText(/None in the chats loaded so far/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load older chats' })).toBeInTheDocument()
  })

  it('shows Loading... on the button while a page is on its way', () => {
    render(<ConversationList {...baseProps} conversations={[chat(1, 'Mei', 60)]} canLoadMore isLoadingMore />)

    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
  })
})

describe('ConversationList while searching', () => {
  it('heads the people found and the chats found by their words, and marks the words', () => {
    const mei = chat(1, 'Mei Lin', 60)
    const aisha = chat(2, 'Aisha', 30)
    renderList([mei, aisha], 0, {
      search: 'mei',
      peopleIds: new Set([1]),
      matchOf: (conversation) => (conversation.id === 1 ? 'Mei Lin' : null),
      snippets: new Map([[2, 'Ask Mei about it']]),
    })

    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Chats', 'Found in messages'])
    // The row of a WhatsApp chat is titled by its number, so the name that fits is shown under it, marked.
    const marks = screen.getAllByText('Mei', { selector: 'mark' })
    expect(marks).toHaveLength(2)
    expect(marks[0].closest('span.truncate')).toHaveTextContent('Mei Lin')
    expect(marks[1].closest('span.truncate')).toHaveTextContent('Found: Ask Mei about it')
  })

  it('marks the digits of a number whatever the spaces and dashes', () => {
    renderList([chat(1, 'Mei Lin', 60)], 0, {
      search: '123456',
      peopleIds: new Set([1]),
      matchOf: () => '+60 12-345 6789',
    })

    expect(screen.getByText('12-345 6', { selector: 'mark' })).toBeInTheDocument()
  })

  it('shows no headings when nothing is searched', () => {
    renderList([chat(1, 'Mei Lin', 60)], 0)

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })
})
