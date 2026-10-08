import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickReply } from '../../lib/quickReplies'
import { Composer } from './Composer'

const download = vi.hoisted(() => vi.fn())
vi.mock('../../lib/quickRepliesApi', () => ({ downloadQuickReplyMedia: download }))

const replies: QuickReply[] = [
  { id: 1, title: 'Trial details', messages: ['Hi {parent name}, {child name} is booked on {trial date}.'], media: [], isActive: true },
  {
    id: 2,
    title: 'Fees poster',
    messages: ['Our fees are attached.'],
    media: [{ path: 'p/1.png', name: 'fees.png', type: 'image/png', size: 10 }],
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

  it('puts the chosen reply in the box with the names filled in, and does not send it', async () => {
    const { onSend } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Trial details/ }))

    expect(screen.getByLabelText('Message to parent')).toHaveValue('Hi Mei Ling, Ethan is booked on Oct 12, 2026.')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('puts a second and third message in their own boxes and sends each on its own', async () => {
    const { onSend } = setupWith([
      { id: 3, title: 'Welcome', messages: ['Hi {parent name}', 'Fees are RM100', 'See you soon'], media: [], isActive: true },
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Welcome/ }))

    expect(screen.getByLabelText('Message to parent')).toHaveValue('Hi Mei Ling')
    expect(screen.getByLabelText('Message 2')).toHaveValue('Fees are RM100')
    expect(screen.getByLabelText('Message 3')).toHaveValue('See you soon')

    await userEvent.click(screen.getByRole('button', { name: 'Remove message 3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith({
      content: 'Hi Mei Ling',
      isPrivate: false,
      files: [],
      moreTexts: ['Fees are RM100'],
    })
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

  it('attaches the reply photo so it goes out with the message', async () => {
    const photo = new File(['x'], 'fees.png', { type: 'image/png' })
    download.mockResolvedValue(photo)
    const { onSend } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Fees poster/ }))
    await waitFor(() => expect(screen.getByText('fees.png')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledWith({ content: 'Our fees are attached.', isPrivate: false, files: [photo], moreTexts: [] })
  })

  it('will not send while a {tag} is still unfilled', async () => {
    const { onSend } = setup({ '{parent name}': 'Mei Ling', '{child name}': '', '{trial date}': '' })

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('option', { name: /Trial details/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByText('Fill in {child name}, {trial date} before sending.')).toBeInTheDocument()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('offers the manage link only when it is allowed', async () => {
    const { onManage } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    await userEvent.click(screen.getByRole('button', { name: 'Manage quick replies' }))

    expect(onManage).toHaveBeenCalled()
  })
})
