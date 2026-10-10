import { render, screen } from '@testing-library/react'
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
  render(
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
