import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { togglePinnedMessage, type ChatwootConversation, type ChatwootMessage } from '../../lib/whatsappInbox'
import { ChatPanel } from './ChatPanel'

const NOW = 1_800_000_000
const conversation: ChatwootConversation = {
  id: 1, status: 'open', unread_count: 0, waiting_since: 0, timestamp: NOW, last_activity_at: NOW,
  meta: { sender: { id: 1, name: 'Tracy Sin', phone_number: '+60162031550', identifier: null } },
}
const message = (id: number, content: string): ChatwootMessage => ({
  id, content, message_type: 0, created_at: NOW - 600 + id, private: false, status: 'sent', source_id: `WAID:${id}`,
})

function setup(pinned: number[], onTogglePinMessage = vi.fn()) {
  render(
    <ChatPanel
      conversation={conversation}
      messages={[message(1, 'Class is on Saturday 10am, Room 2'), message(2, 'Thank you')]}
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
      pinnedMessageIds={pinned}
      onTogglePinMessage={onTogglePinMessage}
    />,
  )
  return onTogglePinMessage
}

describe('pinned messages', () => {
  it('keeps at most 3, the newest first, like WhatsApp', () => {
    expect(togglePinnedMessage([3, 2, 1], 4)).toEqual([4, 3, 2])
    expect(togglePinnedMessage([4, 3], 3)).toEqual([4])
    expect(togglePinnedMessage(undefined, 9)).toEqual([9])
  })

  it('shows a pinned message at the top of the chat, and unpins it from there', async () => {
    const onToggle = setup([1])
    const bar = screen.getByLabelText('Pinned messages')
    expect(bar).toHaveTextContent('Class is on Saturday 10am, Room 2')
    await userEvent.click(within(bar).getByRole('button', { name: 'Unpin this message' }))
    expect(onToggle).toHaveBeenCalledWith(1)
  })

  it('has no bar when nothing is pinned, and a Pin button on each message', async () => {
    const onToggle = setup([])
    expect(screen.queryByLabelText('Pinned messages')).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Pin this message' })[1])
    expect(onToggle).toHaveBeenCalledWith(2)
  })
})
