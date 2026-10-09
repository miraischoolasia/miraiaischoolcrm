import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { QuickReply } from '../../lib/quickReplies'
import { QuickReplyManager } from './QuickReplyManager'

const existing: QuickReply = {
  id: 4,
  title: 'Trial details',
  steps: [
    { kind: 'text', text: 'Come at 2pm' },
    { kind: 'media', media: { path: 'a/1.png', name: 'map.png', type: 'image/png', size: 10 } },
  ],
  isActive: true,
}
const second: QuickReply = { id: 5, title: 'Fees', steps: [{ kind: 'text', text: 'RM100' }], isActive: true }

function setup(replies: QuickReply[] = [existing]) {
  const onSave = vi.fn().mockResolvedValue(null)
  const onRemove = vi.fn().mockResolvedValue(null)
  const onReorder = vi.fn().mockResolvedValue(null)
  render(
    <QuickReplyManager
      replies={replies}
      isLoading={false}
      loadError={null}
      onClose={vi.fn()}
      onSave={onSave}
      onRemove={onRemove}
      onReorder={onReorder}
    />,
  )
  return { onSave, onRemove, onReorder }
}

describe('QuickReplyManager', () => {
  it('lists the replies with their rows in order', () => {
    setup()

    expect(screen.getByText('Trial details')).toBeInTheDocument()
    expect(screen.getByText('Come at 2pm')).toBeInTheDocument()
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
    await userEvent.type(screen.getByLabelText('Row 1 text'), 'Hi ')
    await userEvent.click(screen.getByRole('button', { name: 'Parent name' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(null, {
        title: 'Hello',
        steps: [{ kind: 'text', text: 'Hi {parent name}' }],
        isActive: true,
      }),
    )
  })

  it('offers up to five rows, and skips a blank text row when saving', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: /New quick reply/ }))
    await userEvent.type(screen.getByLabelText(/^Title/), 'Welcome')
    await userEvent.type(screen.getByLabelText('Row 1 text'), 'First')
    for (let count = 0; count < 4; count += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Add a row' }))
    }
    expect(screen.queryByRole('button', { name: 'Add a row' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    await userEvent.type(screen.getByLabelText('Row 2 text'), 'Second')
    await userEvent.click(screen.getByRole('button', { name: 'Remove row 5' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove row 4' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove row 3' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({
        steps: [
          { kind: 'text', text: 'First' },
          { kind: 'text', text: 'Second' },
        ],
      })),
    )
  })

  it('lets a row be a file, and moves rows up and down', async () => {
    const { onSave } = setup()
    const picture = new File(['x'], 'poster.png', { type: 'image/png' })

    await userEvent.click(screen.getByRole('button', { name: /New quick reply/ }))
    await userEvent.type(screen.getByLabelText(/^Title/), 'Poster first')
    await userEvent.type(screen.getByLabelText('Row 1 text'), 'Look at this')
    await userEvent.click(screen.getByRole('button', { name: 'Add a row' }))
    await userEvent.selectOptions(screen.getByLabelText('Row 2 type'), 'file')
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Row 2' })).getByRole('button', { name: 'Choose file' }))
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    await userEvent.upload(input, picture)
    expect(await screen.findByText('poster.png')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Move row 2 up' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(null, {
        title: 'Poster first',
        steps: [
          { kind: 'file', file: picture },
          { kind: 'text', text: 'Look at this' },
        ],
        isActive: true,
      }),
    )
  })

  it('will not save a file row that has no file', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: /New quick reply/ }))
    await userEvent.type(screen.getByLabelText(/^Title/), 'Empty')
    await userEvent.selectOptions(screen.getByLabelText('Row 1 type'), 'file')
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Row 1 has no file yet')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps the form open and shows why when saving fails', async () => {
    const { onSave } = setup()
    onSave.mockResolvedValue('A quick reply with that title already exists.')

    await userEvent.click(screen.getByRole('button', { name: 'Edit Trial details' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Trial details')
  })

  it('keeps a stored file in its row when the reply is saved again', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Trial details' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(existing, {
        title: 'Trial details',
        steps: [
          { kind: 'text', text: 'Come at 2pm' },
          { kind: 'media', media: existing.steps[1].kind === 'media' ? existing.steps[1].media : undefined },
        ],
        isActive: true,
      }),
    )
  })

  it('drops a row the person removes', async () => {
    const { onSave } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Trial details' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove row 2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save quick reply' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(existing, expect.objectContaining({ steps: [{ kind: 'text', text: 'Come at 2pm' }] })),
    )
  })

  it('saves the order after one reply is dragged onto another', () => {
    const { onReorder } = setup([existing, second])
    const dragged = screen.getByRole('listitem', { name: 'Quick reply Trial details' })
    const target = screen.getByRole('listitem', { name: 'Quick reply Fees' })

    const start = createEvent.dragStart(dragged)
    Object.defineProperty(start, 'dataTransfer', { value: { effectAllowed: '' } })
    fireEvent(dragged, start)
    fireEvent.dragOver(target)
    fireEvent.drop(target)

    expect(onReorder).toHaveBeenCalledWith([5, 4])
  })

  it('deletes only after the person confirms', async () => {
    const { onRemove } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Delete Trial details' }))
    expect(onRemove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(existing))
  })
})
