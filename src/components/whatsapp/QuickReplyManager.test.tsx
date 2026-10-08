import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { QuickReply } from '../../lib/quickReplies'
import { QuickReplyManager } from './QuickReplyManager'

const existing: QuickReply = {
  id: 4,
  title: 'Trial details',
  messages: ['Come at 2pm'],
  media: [{ path: 'a/1.png', name: 'map.png', type: 'image/png', size: 10 }],
  isActive: true,
}

function setup() {
  const onSave = vi.fn().mockResolvedValue(null)
  const onRemove = vi.fn().mockResolvedValue(null)
  render(
    <QuickReplyManager replies={[existing]} isLoading={false} loadError={null} onClose={vi.fn()} onSave={onSave} onRemove={onRemove} />,
  )
  return { onSave, onRemove }
}

describe('QuickReplyManager', () => {
  it('lists the replies with their files', () => {
    setup()

    expect(screen.getByText('Trial details')).toBeInTheDocument()
    expect(screen.getByText('map.png')).toBeInTheDocument()
  })

  it('asks for a title before saving a new reply', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: /New quick reply/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Give it a short title')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves a new reply with a name tag inserted', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: /New quick reply/ }))
    await userEvent.type(screen.getByLabelText(/^Title/), 'Hello')
    await userEvent.type(screen.getByLabelText('Message'), 'Hi ')
    await userEvent.click(screen.getByRole('button', { name: 'Parent name' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(null, {
        title: 'Hello',
        messages: ['Hi {parent name}'],
        isActive: true,
        keep: [],
        add: [],
      }),
    )
  })

  it('adds up to three messages and saves them in order, skipping an empty one', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: /New quick reply/ }))
    await userEvent.type(screen.getByLabelText(/^Title/), 'Welcome')
    await userEvent.type(screen.getByLabelText('Message'), 'First')
    await userEvent.click(screen.getByRole('button', { name: 'Add another message' }))
    await userEvent.type(screen.getByLabelText('Message 2'), 'Second')
    await userEvent.click(screen.getByRole('button', { name: 'Add another message' }))
    expect(screen.queryByRole('button', { name: 'Add another message' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({ messages: ['First', 'Second'] })),
    )
  })

  it('keeps the form open and shows why when saving fails', async () => {
    const { onSave } = setup()
    onSave.mockResolvedValue('A quick reply with that title already exists.')

    await userEvent.click(screen.getByRole('button', { name: 'Edit Trial details' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Trial details')
  })

  it('drops a file the person removes, and keeps the rest', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Trial details' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove map.png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(existing, expect.objectContaining({ keep: [], add: [] })))
  })

  it('deletes only after the person confirms', async () => {
    const { onRemove } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trial details' }))
    expect(onRemove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(existing))
  })
})
