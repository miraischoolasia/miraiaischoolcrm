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
