import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootConversation, ChatwootMessage } from '../../lib/whatsappInbox'
import { ChatPanel } from './ChatPanel'

const NOW = 1_800_000_000

const conversation: ChatwootConversation = {
  id: 1,
  status: 'open',
  unread_count: 0,
  waiting_since: 0,
  timestamp: NOW,
  last_activity_at: NOW,
  meta: { sender: { id: 1, name: 'Tracy Sin', phone_number: '+60162031550', identifier: null } },
}

const ours: ChatwootMessage = {
  id: 1,
  content: 'Please send the receipt',
  message_type: 1,
  created_at: NOW - 600,
  private: false,
  status: 'sent',
  source_id: 'WAID:OURS',
}

const reaction = (ageSeconds: number): ChatwootMessage => ({
  id: 2,
  content: '👌',
  message_type: 0,
  created_at: NOW - ageSeconds,
  private: false,
  status: 'sent',
  source_id: 'WAID:REACT',
  content_attributes: { in_reply_to: 1, in_reply_to_external_id: 'WAID:OURS' },
})

function setup(messages: ChatwootMessage[]) {
  return render(
    <ChatPanel
      conversation={conversation}
      messages={messages}
      waitingMessages={[]}
      hasOlder={false}
      staff={[]}
      actionError={null}
      onBack={vi.fn()}
      onOpenDetails={vi.fn()}
      onLoadOlder={vi.fn()}
      onSend={vi.fn().mockResolvedValue(true)}
      onDismissUnsent={vi.fn()}
      onSetOwner={vi.fn()}
      onSetStatus={vi.fn()}
      onMarkUnread={vi.fn()}
      quickReplies={{ replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }}
      quickReplyValues={{}}
    />,
  )
}

describe('ChatPanel reactions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW * 1000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not flash a reaction that just arrived as a message of its own', () => {
    setup([ours, reaction(3)])

    expect(screen.getByText('Please send the receipt')).toBeInTheDocument()
    expect(screen.queryByText('👌')).not.toBeInTheDocument()
  })

  it('shows a lone emoji that quotes a message once WhatsApp has had time to say it is not a reaction', () => {
    setup([ours, reaction(120)])

    expect(screen.getByText('👌')).toBeInTheDocument()
  })
})

// The boss's "drag a file in, see a small picture" cannot be tried by hand without a real file, so here the whole way
// is played: a file dragged over the chat, dropped, and shown as a picture above the box, nothing sent yet.
describe('ChatPanel files dropped on the chat', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the drop area while dragging, then a picture of each file above the box, and sends nothing', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
    const { container } = setup([ours])
    const panel = container.firstElementChild as HTMLElement
    const photo = new File(['x'], 'poster.png', { type: 'image/png' })
    const pdf = new File(['x'], 'fees.pdf', { type: 'application/pdf' })
    const dataTransfer = { types: ['Files'], files: [photo, pdf] }

    fireEvent.dragEnter(panel, { dataTransfer })
    expect(screen.getByText('Drop files to attach them to your message')).toBeInTheDocument()

    fireEvent.drop(panel, { dataTransfer })
    expect(screen.queryByText('Drop files to attach them to your message')).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'poster.png' })).toHaveAttribute('src', 'blob:preview')
    expect(screen.getByText('fees.pdf')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByPlaceholderText('Add a caption')).toHaveFocus())
  })

  it('takes no notice of dragged text that is not a file', () => {
    const { container } = setup([ours])
    const panel = container.firstElementChild as HTMLElement
    fireEvent.dragEnter(panel, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Drop files to attach them to your message')).not.toBeInTheDocument()
  })
})
