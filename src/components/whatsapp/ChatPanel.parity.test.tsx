import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootConversation, ChatwootMessage } from '../../lib/whatsappInbox'
import { ChatPanel } from './ChatPanel'

// What the chat does the way WhatsApp does: search in the chat, copy, go to the quoted message, the photo
// viewer, the button down to the newest message, dropping files, message info, the "unread" line.

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

const message = (id: number, content: string, ageSeconds: number, extra: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id,
  content,
  message_type: 0,
  created_at: NOW - ageSeconds,
  private: false,
  status: 'sent',
  source_id: `WAID:${id}`,
  ...extra,
})

function setup(messages: ChatwootMessage[], overrides: Partial<ChatwootConversation> = {}, hasOlder = false) {
  const onLoadOlder = vi.fn()
  const view = render(
    <ChatPanel
      conversation={{ ...conversation, ...overrides }}
      messages={messages}
      waitingMessages={[]}
      hasOlder={hasOlder}
      staff={[]}
      actionError={null}
      onBack={vi.fn()}
      onOpenDetails={vi.fn()}
      onLoadOlder={onLoadOlder}
      onSend={vi.fn().mockResolvedValue(true)}
      onDismissUnsent={vi.fn()}
      onSetOwner={vi.fn()}
      onSetStatus={vi.fn()}
      onMarkUnread={vi.fn()}
      quickReplies={{ replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }}
      quickReplyValues={{}}
    />,
  )
  return { ...view, onLoadOlder }
}

const scrolledTo = vi.fn()

beforeEach(() => {
  scrolledTo.mockClear()
  // jsdom has no scrolling; record which message the chat was scrolled to.
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolledTo(this.closest('[data-message-id]')?.getAttribute('data-message-id') ?? this.getAttribute('data-unread-divider') ?? 'other')
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('searching in a chat', () => {
  const messages = [
    message(1, 'What are the fees?', 900),
    message(2, 'Fees are RM100 a month', 600, { message_type: 1 }),
    message(3, 'Thanks, see you', 300),
    message(4, 'One more question about fees', 100),
  ]

  it('marks the words, counts the matches and goes to the newest one first', async () => {
    const { container } = setup(messages)

    await userEvent.click(screen.getByRole('button', { name: 'Search in this chat' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search in this chat' }), 'fees')

    expect(screen.getByText('3 of 3')).toBeInTheDocument()
    expect(container.querySelectorAll('mark')).toHaveLength(3)
    expect(scrolledTo).toHaveBeenLastCalledWith('4')

    // The up arrow goes to the older match, the down arrow back; both wrap round.
    await userEvent.click(screen.getByRole('button', { name: 'Previous match, older' }))
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    expect(scrolledTo).toHaveBeenLastCalledWith('2')
    await userEvent.click(screen.getByRole('button', { name: 'Next match, newer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next match, newer' }))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('says so when nothing is found, and Enter steps to the older match', async () => {
    setup(messages)

    await userEvent.click(screen.getByRole('button', { name: 'Search in this chat' }))
    const box = screen.getByRole('searchbox', { name: 'Search in this chat' })
    await userEvent.type(box, 'zzz')
    expect(screen.getByText('No messages found')).toBeInTheDocument()

    await userEvent.clear(box)
    await userEvent.type(box, 'fees{Enter}')
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('closes with Escape and takes the marks away', async () => {
    const { container } = setup(messages)

    await userEvent.click(screen.getByRole('button', { name: 'Search in this chat' }))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search in this chat' }), 'fees{Escape}')

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(container.querySelectorAll('mark')).toHaveLength(0)
  })

  it('offers to load earlier messages, because only the loaded ones are searched', async () => {
    const { onLoadOlder } = setup(messages, {}, true)

    await userEvent.click(screen.getByRole('button', { name: 'Search in this chat' }))
    await userEvent.click(screen.getByRole('button', { name: /Only the messages loaded so far are searched/ }))

    expect(onLoadOlder).toHaveBeenCalled()
  })
})

describe('copying a message', () => {
  it('puts the words of the message on the clipboard', async () => {
    const user = userEvent.setup()
    setup([message(1, 'Zoom link: zoom.us/j/123', 100)])

    await user.click(screen.getByRole('button', { name: 'Copy this message' }))

    expect(await navigator.clipboard.readText()).toBe('Zoom link: zoom.us/j/123')
  })
})

describe('going to the message a quote answers', () => {
  it('scrolls to the original and makes it glow for a moment', async () => {
    setup([
      message(1, 'Class is at 5pm', 900),
      message(2, 'Thanks', 600),
      message(3, 'Ok noted', 300, { message_type: 1, content_attributes: { in_reply_to: 1 } }),
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Go to the message this answers' }))

    expect(scrolledTo).toHaveBeenLastCalledWith('1')
    const original = screen.getByText('Class is at 5pm', { selector: 'div.whitespace-pre-wrap.break-words' })
    expect(original.closest('.bg-yellow-100')).not.toBeNull()
  })
})

describe('the photo viewer', () => {
  const photo = (id: number, attachmentId: number, age: number) =>
    message(id, '', age, { attachments: [{ id: attachmentId, file_type: 'image', data_url: `https://files.test/${attachmentId}.jpg` }] })

  it('opens on the photo, goes through the other photos of the chat, and closes with Escape', async () => {
    setup([photo(1, 11, 900), message(2, 'Nice', 700), photo(3, 33, 500)])

    await userEvent.click(screen.getAllByRole('link', { name: 'Photo in this chat' })[1])
    const viewer = screen.getByRole('dialog', { name: 'Photo viewer' })
    expect(within(viewer).getByText('2 of 2')).toBeInTheDocument()
    expect(within(viewer).getAllByRole('img')[0]).toHaveAttribute('src', 'https://files.test/33.jpg')

    await userEvent.click(within(viewer).getByRole('button', { name: 'Previous photo' }))
    expect(within(viewer).getByText('1 of 2')).toBeInTheDocument()
    expect(within(viewer).getAllByRole('img')[0]).toHaveAttribute('src', 'https://files.test/11.jpg')

    await userEvent.keyboard('{ArrowRight}')
    expect(within(viewer).getByText('2 of 2')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).not.toBeInTheDocument()
  })
})

describe('the button down to the newest message', () => {
  function scrollAway(box: HTMLElement, distance: number) {
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 500 })
    Object.defineProperty(box, 'scrollTop', { configurable: true, writable: true, value: 2000 - 500 - distance })
    fireEvent.scroll(box)
  }

  it('shows when scrolled up, counts what came in meanwhile, and goes back down', async () => {
    const first = [message(1, 'Hello', 900)]
    const { container, rerender } = setup(first)
    const box = container.querySelector('.overflow-y-auto') as HTMLElement
    expect(screen.queryByRole('button', { name: /Scroll to the newest message/ })).not.toBeInTheDocument()

    scrollAway(box, 800)
    expect(screen.getByRole('button', { name: 'Scroll to the newest message' })).toBeInTheDocument()

    // Two parent messages arrive while reading old ones.
    rerender(
      <ChatPanel
        conversation={conversation}
        messages={[...first, message(2, 'Are you there?', 60), message(3, 'Hello?', 30)]}
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
    const button = screen.getByRole('button', { name: 'Scroll to the newest message, 2 new' })
    expect(button).toHaveTextContent('2')

    await userEvent.click(button)
    scrollAway(box, 0)
    expect(screen.queryByRole('button', { name: /Scroll to the newest message/ })).not.toBeInTheDocument()
  })
})

describe('dropping files on the chat', () => {
  it('shows the sign while dragging and puts the files in the message box when dropped', () => {
    const { container } = setup([message(1, 'Hello', 100)])
    const panel = container.firstElementChild as HTMLElement
    const file = new File(['abc'], 'timetable.pdf', { type: 'application/pdf' })
    const dataTransfer = { types: ['Files'], files: [file] }

    fireEvent.dragEnter(panel, { dataTransfer })
    expect(screen.getByText('Drop files to attach them to your message')).toBeInTheDocument()

    const drop = createEvent.drop(panel, { dataTransfer })
    fireEvent(panel, drop)
    expect(screen.queryByText('Drop files to attach them to your message')).not.toBeInTheDocument()
    expect(screen.getByText('timetable.pdf')).toBeInTheDocument()
    expect(drop.defaultPrevented).toBe(true)
  })

  it('ignores things dragged in that are not files', () => {
    const { container } = setup([message(1, 'Hello', 100)])
    fireEvent.dragEnter(container.firstElementChild as HTMLElement, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Drop files to attach them to your message')).not.toBeInTheDocument()
  })
})

describe('message info', () => {
  it('shows when, who, the status and where the message went through', async () => {
    setup([message(5, 'Class is at 5pm', 100, { message_type: 1, status: 'read', sender: { name: 'Amy', type: 'user' } })])

    await userEvent.click(screen.getByRole('button', { name: 'Message info' }))

    const info = screen.getByLabelText('Message info', { selector: 'dl' })
    expect(within(info).getByText('Sent by')).toBeInTheDocument()
    expect(within(info).getByText('Amy')).toBeInTheDocument()
    expect(within(info).getByText('Read')).toBeInTheDocument()
    expect(within(info).getByText('WhatsApp')).toBeInTheDocument()
    expect(within(info).getByText('5')).toBeInTheDocument()
  })
})

describe('the line that says how many messages are unread', () => {
  const messages = [message(1, 'Old message', 5000), message(2, 'New one', 300), message(3, 'Another new one', 200)]

  it('is drawn above the first unread message and the chat opens there', () => {
    setup(messages, { unread_count: 2 })

    expect(screen.getByText('2 unread messages')).toBeInTheDocument()
    const divider = screen.getByText('2 unread messages')
    expect(divider.closest('[data-message-id]')?.getAttribute('data-message-id')).toBe('2')
    // The chat is scrolled to the line (which sits inside the first unread message).
    expect(scrolledTo).toHaveBeenCalledWith('2')
  })

  it('is not drawn when nothing is unread, or when the chat was only marked unread by hand', () => {
    const { unmount } = setup(messages, { unread_count: 0 })
    expect(screen.queryByText(/unread message/)).not.toBeInTheDocument()
    unmount()

    setup(messages, { unread_count: 1, custom_attributes: { crm_marked_unread: true } })
    expect(screen.queryByText(/unread message/)).not.toBeInTheDocument()
  })

  it('stays where it was when the chat reads as read a moment later', () => {
    const { rerender } = setup(messages, { unread_count: 2 })
    rerender(
      <ChatPanel
        conversation={{ ...conversation, unread_count: 0 }}
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
    expect(screen.getByText('2 unread messages')).toBeInTheDocument()
  })
})
