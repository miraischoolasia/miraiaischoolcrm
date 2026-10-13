import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootConversation, ChatwootMessage } from '../../lib/whatsappInbox'
import { resetAiSuggestions } from '../../hooks/useAiSuggestion'
import { ChatPanel } from './ChatPanel'

const ai = vi.hoisted(() => ({ request: vi.fn(), sent: vi.fn() }))
vi.mock('../../lib/aiDraft', async (original) => ({
  ...(await original<typeof import('../../lib/aiDraft')>()),
  requestAiDraft: ai.request,
  recordAiDraftSent: ai.sent,
  markAiDraftAccepted: vi.fn(),
}))

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
const parent: ChatwootMessage = {
  id: 7,
  content: '你们有什么课？',
  message_type: 0,
  created_at: NOW - 60,
  private: false,
  status: 'sent',
}

function setup(onSend = vi.fn().mockResolvedValue(true)) {
  render(
    <ChatPanel
      conversation={conversation}
      messages={[parent]}
      waitingMessages={[]}
      hasOlder={false}
      staff={[]}
      actionError={null}
      onBack={vi.fn()}
      onOpenDetails={vi.fn()}
      onLoadOlder={vi.fn()}
      onSend={onSend}
      onDismissUnsent={vi.fn()}
      onSetOwner={vi.fn()}
      onSetStatus={vi.fn()}
      onMarkUnread={vi.fn()}
      quickReplies={{ replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }}
      quickReplyValues={{}}
      aiContext={{ children: [], teamName: 'Lex' }}
    />,
  )
  return onSend
}

beforeEach(() => {
  resetAiSuggestions()
  ai.request.mockReset().mockResolvedValue({
    kind: 'draft',
    suggestion: { id: 42, text: '妈咪，孩子几岁呢？', note: '' },
  })
  ai.sent.mockReset().mockResolvedValue(undefined)
})

describe('ChatPanel records what the team sent against the AI draft', () => {
  it('records the changed text of a used draft', async () => {
    const user = userEvent.setup()
    const onSend = setup()
    await user.click(await screen.findByText('妈咪，孩子几岁呢？'))
    const box = screen.getByRole('textbox')
    await user.type(box, ' 平时有玩电脑吗？')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => expect(onSend).toHaveBeenCalled())
    expect(ai.sent).toHaveBeenCalledWith(42, '妈咪，孩子几岁呢？ 平时有玩电脑吗？')
  })

  it('records the reply of someone who ignored the draft and wrote their own', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByText('妈咪，孩子几岁呢？'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'We have HOA and Holiday Camp')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(ai.sent).toHaveBeenCalledWith(42, 'We have HOA and Holiday Camp'))
  })

  it('does not record a private note, or a message that failed to send', async () => {
    const user = userEvent.setup()
    setup(vi.fn().mockResolvedValue(false))
    await user.click(await screen.findByText('妈咪，孩子几岁呢？'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'Hello')
    await user.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('Hello'))
    expect(ai.sent).not.toHaveBeenCalled()
  })
})
