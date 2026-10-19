import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickReply } from '../../lib/quickReplies'
import { Composer } from './Composer'

const download = vi.hoisted(() => vi.fn())
vi.mock('../../lib/quickRepliesApi', () => ({ downloadQuickReplyMedia: download }))

const replies: QuickReply[] = [
  { id: 1, title: 'Trial details', steps: [{ kind: 'text', text: 'Hi {parent name}, {child name} is booked on {trial date}.' }], isActive: true },
  {
    id: 2,
    title: 'Fees poster',
    steps: [
      { kind: 'media', media: { path: 'p/1.png', name: 'fees.png', type: 'image/png', size: 10 } },
      { kind: 'text', text: 'Our fees are attached.' },
    ],
    isActive: true,
  },
]

function setup(values = { '{parent name}': 'Mei Ling', '{child name}': 'Ethan', '{trial date}': 'Oct 12, 2026' }) {
  return setupWith(replies, values)
}

function setupWith(
  list: QuickReply[],
  values: Record<string, string> = { '{parent name}': 'Mei Ling', '{child name}': 'Ethan', '{trial date}': 'Oct 12, 2026' },
) {
  const onSend = vi.fn().mockResolvedValue(true)
  const onManage = vi.fn()
  render(
    <Composer
      onSend={onSend}
      quickReplies={{ replies: list, isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }}
      variables={values}
      onManageQuickReplies={onManage}
    />,
  )
  return { onSend, onManage }
}

describe('Composer quick replies', () => {
  beforeEach(() => {
    download.mockReset()
  })

  it('puts the chosen reply in as a row with the names filled in, and does not send it', async () => {
    const { onSend } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Trial details/ }))

    expect(screen.getByLabelText('Message 1')).toHaveValue('Hi Mei Ling, Ethan is booked on Oct 12, 2026.')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows every row in its order and sends each on its own, in that order, without the row taken out', async () => {
    const photo = new File(['x'], 'poster.png', { type: 'image/png' })
    download.mockResolvedValue(photo)
    const { onSend } = setupWith([
      {
        id: 3,
        title: 'Welcome',
        steps: [
          { kind: 'text', text: 'Hi {parent name}' },
          { kind: 'media', media: { path: 'p/2.png', name: 'poster.png', type: 'image/png', size: 5 } },
          { kind: 'text', text: 'Fees are RM100' },
          { kind: 'text', text: 'See you soon' },
        ],
        isActive: true,
      },
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Welcome/ }))
    await waitFor(() => expect(screen.getByText('poster.png')).toBeInTheDocument())

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(screen.getByLabelText('Message 1')).toHaveValue('Hi Mei Ling')
    expect(screen.getByLabelText('Message 3')).toHaveValue('Fees are RM100')

    await userEvent.click(screen.getByRole('button', { name: 'Remove row 4' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith({ isPrivate: false, sequence: ['Hi Mei Ling', photo, 'Fees are RM100', ''] })
  })

  it('filters the list as you type', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.type(screen.getByLabelText('Search quick replies'), 'fees')

    expect(screen.queryByRole('option', { name: /Trial details/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Fees poster/ })).toBeInTheDocument()
  })

  it('opens the list when "/" is typed in an empty box', async () => {
    setup()

    await userEvent.type(screen.getByLabelText('Message to parent'), '/')

    expect(screen.getByLabelText('Search quick replies')).toBeInTheDocument()
    expect(screen.getByLabelText('Message to parent')).toHaveValue('')
  })

  it('keeps a photo row ahead of the text that follows it', async () => {
    const photo = new File(['x'], 'fees.png', { type: 'image/png' })
    download.mockResolvedValue(photo)
    const { onSend } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Fees poster/ }))
    await waitFor(() => expect(screen.getByText('fees.png')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith({ isPrivate: false, sequence: [photo, 'Our fees are attached.', ''] })
  })

  it('will not send while a {tag} is still unfilled', async () => {
    const { onSend } = setup({ '{parent name}': 'Mei Ling', '{child name}': '', '{trial date}': '' })

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Trial details/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByText('Fill in {child name}, {trial date} before sending.')).toBeInTheDocument()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('adds an emoji where the cursor is, and keeps the box open for more', async () => {
    window.localStorage.clear()
    setup()
    const box = screen.getByLabelText('Message to parent')

    await userEvent.type(box, 'Hi  there')
    ;(box as HTMLTextAreaElement).setSelectionRange(3, 3)
    await userEvent.click(screen.getByRole('button', { name: 'Add an emoji' }))
    await userEvent.click(screen.getByRole('button', { name: '😀' }))
    await userEvent.click(screen.getByRole('button', { name: '😃' }))

    expect(box).toHaveValue('Hi 😀😃 there')
    expect(screen.getByRole('dialog', { name: 'Emoji' })).toBeInTheDocument()
  })

  it('offers the manage link only when it is allowed', async () => {
    const { onManage } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('button', { name: 'Manage quick replies' }))

    expect(onManage).toHaveBeenCalled()
  })
})

describe('Composer drafts', () => {
  const quickReplies = { replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }

  it('reports what is written as a draft, and nothing once it is sent', async () => {
    const onDraftChange = vi.fn()
    render(<Composer onSend={vi.fn().mockResolvedValue(true)} quickReplies={quickReplies} variables={{}} onDraftChange={onDraftChange} />)

    await userEvent.type(screen.getByLabelText('Message to parent'), 'Hi')
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Hi', mode: 'reply' }))

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onDraftChange).toHaveBeenLastCalledWith(null)
  })

  it('comes back with the text, the rows and the files that were left', () => {
    const photo = new File(['x'], 'a.png', { type: 'image/png' })
    render(
      <Composer
        onSend={vi.fn()}
        quickReplies={quickReplies}
        variables={{}}
        draft={{
          mode: 'note',
          text: 'Call back',
          queue: [{ id: 1, kind: 'text', text: 'Row text' }],
          files: [photo],
        }}
      />,
    )

    expect(screen.getByLabelText('Private note')).toHaveValue('Call back')
    expect(screen.getByLabelText('Message 1')).toHaveValue('Row text')
    expect(screen.getByText('a.png')).toBeInTheDocument()
  })
})

describe('Composer replying', () => {
  const quickReplies = { replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }

  it('shows what is being answered, sends it as the quote of the first message, then clears it', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const onClearReply = vi.fn()
    render(
      <Composer
        onSend={onSend}
        quickReplies={quickReplies}
        variables={{}}
        replyTo={{ id: 12, author: 'Mei Ling', text: 'What time?' }}
        onClearReply={onClearReply}
      />,
    )

    expect(screen.getByText('Replying to Mei Ling')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Message to parent'), 'At 2')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith({ isPrivate: false, sequence: ['At 2'], replyTo: 12 })
    expect(onClearReply).toHaveBeenCalled()
  })

  it('lets the reply be cancelled', async () => {
    const onClearReply = vi.fn()
    render(
      <Composer
        onSend={vi.fn()}
        quickReplies={quickReplies}
        variables={{}}
        replyTo={{ id: 1, author: 'A', text: 'b' }}
        onClearReply={onClearReply}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }))

    expect(onClearReply).toHaveBeenCalled()
  })
})

describe('Composer video size', () => {
  const quickReplies = { replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }

  it('refuses a video over 32 MB with a message, and still takes a smaller one', async () => {
    const { container } = render(<Composer onSend={vi.fn().mockResolvedValue(true)} quickReplies={quickReplies} variables={{}} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const big = new File(['x'], 'big.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: 40 * 1024 * 1024 })
    const small = new File(['x'], 'small.mp4', { type: 'video/mp4' })

    await userEvent.upload(input, [big, small])

    expect(screen.getByText(/"big.mp4" is 40.0 MB. A video can be at most 32 MB/)).toBeInTheDocument()
    expect(screen.getByText('small.mp4')).toBeInTheDocument()
    expect(screen.queryByText('big.mp4')).not.toBeInTheDocument()
  })
})

describe('Composer AI suggestion', () => {
  const quickReplies = { replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }
  const suggestion = { text: 'Hi 妈咪😊 孩子几岁呢？', note: '付款方式没有资料' }

  function setupAi(props: Partial<React.ComponentProps<typeof Composer>> = {}) {
    const handlers = { onAiUse: vi.fn(), onAiDismiss: vi.fn(), onAiSuggest: vi.fn(), onSend: vi.fn().mockResolvedValue(true) }
    render(
      <Composer
        quickReplies={quickReplies}
        variables={{}}
        aiSuggestion={suggestion}
        aiAvailable
        {...handlers}
        {...props}
      />,
    )
    return handlers
  }

  it('shows the suggestion as grey text in place of the box, with its note, and sends nothing', () => {
    const { onSend } = setupAi()
    expect(screen.getByRole('button', { name: 'Use the suggested reply' })).toHaveTextContent('Hi 妈咪😊 孩子几岁呢？')
    expect(screen.getByRole('button', { name: 'Use the suggested reply' })).toHaveClass('text-slate-400')
    expect(screen.queryByLabelText('Message to parent')).not.toBeInTheDocument()
    expect(screen.getByText('付款方式没有资料')).toBeInTheDocument()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('turns into the real text, in the box and ready to edit, when it is clicked', async () => {
    const { onAiUse, onSend } = setupAi()
    await userEvent.click(screen.getByRole('button', { name: 'Use the suggested reply' }))
    const box = screen.getByLabelText('Message to parent')
    expect(box).toHaveValue('Hi 妈咪😊 孩子几岁呢？')
    expect(box).toHaveFocus()
    expect(box).not.toHaveClass('text-slate-400')
    expect(onAiUse).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    // It is ordinary text now: it can be changed.
    await userEvent.type(box, ' ok')
    expect(box).toHaveValue('Hi 妈咪😊 孩子几岁呢？ ok')
  })

  it('can be put away', async () => {
    const { onAiDismiss } = setupAi()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss the suggested reply' }))
    expect(onAiDismiss).toHaveBeenCalledTimes(1)
  })

  it('is used with Enter on the grey text and put away with Escape', async () => {
    const { onAiUse, onAiDismiss } = setupAi()
    const grey = screen.getByRole('button', { name: 'Use the suggested reply' })
    grey.focus()
    await userEvent.keyboard('{Escape}')
    expect(onAiDismiss).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Enter}')
    expect(onAiUse).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Message to parent')).toHaveValue('Hi 妈咪😊 孩子几岁呢？')
  })

  it('is not shown for a private note', async () => {
    setupAi()
    await userEvent.click(screen.getByRole('button', { name: 'Private note' }))
    expect(screen.queryByRole('button', { name: 'Use the suggested reply' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Private note')).toBeInTheDocument()
  })

  it('is not shown when something is already written', () => {
    setupAi({ draft: { mode: 'reply', text: 'Hello', queue: [], files: [] } })
    expect(screen.queryByRole('button', { name: 'Use the suggested reply' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Message to parent')).toHaveValue('Hello')
  })

  it('offers to write a reply when there is none, and says it is writing', async () => {
    const { onAiSuggest } = setupAi({ aiSuggestion: null })
    await userEvent.click(screen.getByRole('button', { name: 'Suggest a reply' }))
    expect(onAiSuggest).toHaveBeenCalledTimes(1)
  })

  it('disables the button while the reply is being written, and shows a failure quietly', () => {
    setupAi({ aiSuggestion: null, aiLoading: true })
    expect(screen.getByRole('button', { name: 'Suggest a reply' })).toBeDisabled()
    expect(screen.getByText('Writing…')).toBeInTheDocument()
  })

  it('shows why there is no suggestion', () => {
    setupAi({ aiSuggestion: null, aiError: 'The AI key has not been set up yet.' })
    expect(screen.getByText('The AI key has not been set up yet.')).toBeInTheDocument()
  })

  it('has no button when the feature is off', () => {
    setupAi({ aiSuggestion: null, onAiSuggest: undefined })
    expect(screen.queryByRole('button', { name: 'Suggest a reply' })).not.toBeInTheDocument()
  })
})

describe('Composer like WhatsApp', () => {
  function renderPlain(extra: Partial<React.ComponentProps<typeof Composer>> = {}) {
    render(
      <Composer
        onSend={vi.fn().mockResolvedValue(true)}
        quickReplies={{ replies: [], isLoading: false, error: null, reload: vi.fn().mockResolvedValue(undefined) }}
        variables={{}}
        {...extra}
      />,
    )
  }

  it('keeps the extra buttons behind one "+" and closes the menu on Escape', async () => {
    renderPlain({ onSendSpecial: vi.fn().mockResolvedValue(null) })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attach a photo, video or file' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Attach and more' }))
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual(['Photo, video or file', 'Location', 'Contact', 'Poll', 'Sticker'])

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('has the quick replies button right after the emoji button', () => {
    renderPlain()

    const buttons = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    const emoji = buttons.indexOf('Add an emoji')
    expect(buttons.slice(emoji - 1, emoji + 2)).toEqual(['Attach and more', 'Add an emoji', 'Quick replies'])
  })

  it('opens the quick reply list from the bolt button, and closes it on a second press', async () => {
    renderPlain()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    expect(screen.getByRole('button', { name: 'Quick replies' })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    expect(screen.getByRole('button', { name: 'Quick replies' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the microphone while the box is empty and the send button once something is written', async () => {
    renderPlain()

    expect(screen.getByRole('button', { name: 'Record a voice message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Write a message'), 'Hi')
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record a voice message' })).not.toBeInTheDocument()
  })

  it('has no keyboard hint under the box, and says where the reply goes out from', () => {
    renderPlain({ sendingFrom: 'Mirai WhatsApp · +60 12-345 6789' })

    expect(screen.queryByText(/Enter to send/)).not.toBeInTheDocument()
    expect(screen.getByText('Mirai WhatsApp · +60 12-345 6789')).toBeInTheDocument()
  })
})
