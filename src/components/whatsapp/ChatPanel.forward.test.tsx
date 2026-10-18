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

function setup(onForward: (messages: ChatwootMessage[]) => void) {
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
      onForward={onForward}
    />,
  )
}

describe('ChatPanel picking several messages to forward', () => {
  it('forwards the ticked messages together, oldest first', async () => {
    const onForward = vi.fn()
    setup(onForward)

    // Start from the later message, then tick an earlier one.
    await userEvent.click(screen.getAllByRole('button', { name: 'Select messages' })[1])
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Class is at 5pm'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }))

    expect(onForward).toHaveBeenCalledTimes(1)
    expect(onForward.mock.calls[0][0].map((entry: ChatwootMessage) => entry.id)).toEqual([1, 2])
  })

  it('leaves picking when Cancel is pressed', async () => {
    setup(vi.fn())

    await userEvent.click(screen.getAllByRole('button', { name: 'Select messages' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })

  it('turns picking on when Forward is pressed on a message, and only sends from the Forward button below', async () => {
    const onForward = vi.fn()
    setup(onForward)

    await userEvent.click(screen.getAllByRole('button', { name: 'Forward this message' })[2])
    // Nothing is sent yet: the message is ticked and the bar asks for more or for Forward.
    expect(onForward).not.toHaveBeenCalled()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    // The message box is put away while picking (kept, so what was typed is not lost).
    expect(screen.getByPlaceholderText('Write a message').closest('.hidden')).not.toBeNull()

    await userEvent.click(screen.getByText('Zoom link below'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }))

    expect(onForward.mock.calls[0][0].map((entry: ChatwootMessage) => entry.id)).toEqual([2, 3])
  })

  it('leaves picking with Escape and brings the message box back', async () => {
    setup(vi.fn())

    await userEvent.click(screen.getAllByRole('button', { name: 'Forward this message' })[0])
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write a message').closest('.hidden')).toBeNull()
  })
})
