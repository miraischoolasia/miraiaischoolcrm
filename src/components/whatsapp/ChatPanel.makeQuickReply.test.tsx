import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

const message = (id: number, content: string, ageSeconds: number): ChatwootMessage => ({
  id,
  content,
  message_type: 1,
  created_at: NOW - ageSeconds,
  private: false,
  status: 'sent',
  source_id: `WAID:${id}`,
})

function setup(handlers: { onMakeQuickReply?: (messages: ChatwootMessage[]) => void; onForward?: (messages: ChatwootMessage[]) => void }) {
  render(
    <ChatPanel
      conversation={conversation}
      messages={[message(1, 'Class is at 5pm', 900), message(2, 'Zoom link below', 600), message(3, 'Thanks', 300)]}
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
      {...handlers}
    />,
  )
}

describe('ChatPanel picking several messages for a quick reply', () => {
  it('hands the ticked messages over oldest first and leaves picking', async () => {
    const onMakeQuickReply = vi.fn()
    setup({ onMakeQuickReply, onForward: vi.fn() })

    // Start from the later message, then tick an earlier one.
    await userEvent.click(screen.getAllByRole('button', { name: 'Select messages' })[1])
    await userEvent.click(screen.getByText('Class is at 5pm'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Quick reply' }))

    expect(onMakeQuickReply).toHaveBeenCalledTimes(1)
    expect(onMakeQuickReply.mock.calls[0][0].map((entry: ChatwootMessage) => entry.id)).toEqual([1, 2])
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
  })

  it('shows both buttons when both are wanted, and only Quick reply when forwarding is not', async () => {
    setup({ onMakeQuickReply: vi.fn() })

    await userEvent.click(screen.getAllByRole('button', { name: 'Select messages' })[0])

    expect(screen.getByRole('button', { name: 'Quick reply' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Forward' })).not.toBeInTheDocument()
  })

  it('has no Quick reply button where it is not wanted', async () => {
    setup({ onForward: vi.fn() })

    await userEvent.click(screen.getAllByRole('button', { name: 'Select messages' })[0])

    expect(screen.queryByRole('button', { name: 'Quick reply' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeInTheDocument()
  })
})
