import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ChatwootMessage } from '../../lib/whatsappInbox'
import { MessageBubble, type BubbleActions, type BubbleExtras } from './MessageBubble'

const ours: ChatwootMessage = {
  id: 1,
  content: 'See you at 2',
  message_type: 1,
  created_at: 1_790_000_000,
  private: false,
  status: 'sent',
  source_id: 'WAID:A1',
}

function show(extras: BubbleExtras = {}, actions: BubbleActions = {}, message: ChatwootMessage = ours) {
  return render(<MessageBubble message={message} avatar={null} showAvatar={false} nowSeconds={1_790_000_100} extras={extras} actions={actions} />)
}

describe('MessageBubble reactions, quotes, edits and deletes', () => {
  it('shows the message it answers, above the text', () => {
    show({ quote: { author: 'Mei Ling', text: 'What time?' } })

    expect(screen.getByText('Mei Ling')).toBeInTheDocument()
    expect(screen.getByText('What time?')).toBeInTheDocument()
  })

  it('shows who reacted, grouped, with the count', () => {
    show({ reactions: [{ emoji: '👍', byUs: false }, { emoji: '👍', byUs: true }, { emoji: '❤️', byUs: false }] })

    const row = screen.getByLabelText('Reactions')
    expect(row).toHaveTextContent('👍2')
    expect(row).toHaveTextContent('❤️')
  })

  it('shows a message taken back instead of its text', () => {
    show({ deletedForEveryone: true })

    expect(screen.getByText('This message was deleted')).toBeInTheDocument()
    expect(screen.queryByText('See you at 2')).not.toBeInTheDocument()
  })

  it('shows the changed text with an Edited mark', () => {
    show({ editedText: 'See you at 3' })

    expect(screen.getByText('See you at 3')).toBeInTheDocument()
    expect(screen.getByText('Edited')).toBeInTheDocument()
  })

  it('reacts with the emoji picked, and can take the reaction back', async () => {
    const onReact = vi.fn()
    show({ reactions: [{ emoji: '👍', byUs: true }] }, { onReact })

    await userEvent.click(screen.getByRole('button', { name: 'React to this message' }))
    await userEvent.click(screen.getByRole('button', { name: 'React with ❤️' }))
    expect(onReact).toHaveBeenLastCalledWith('❤️')

    await userEvent.click(screen.getByRole('button', { name: 'React to this message' }))
    await userEvent.click(screen.getByRole('button', { name: 'Take my reaction back' }))
    expect(onReact).toHaveBeenLastCalledWith('')
  })

  it('starts a reply', async () => {
    const onReply = vi.fn()
    show({}, { onReply })

    await userEvent.click(screen.getByRole('button', { name: 'Reply to this message' }))

    expect(onReply).toHaveBeenCalled()
  })

  it('edits the text of what we sent, saving only a real change', async () => {
    const onEdit = vi.fn().mockResolvedValue(true)
    show({ canEdit: true }, { onReply: vi.fn(), onEdit })

    await userEvent.click(screen.getByRole('button', { name: 'Edit this message' }))
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Edit message'))
    await userEvent.type(screen.getByLabelText('Edit message'), 'See you at 4')
    await userEvent.click(save)

    await waitFor(() => expect(onEdit).toHaveBeenCalledWith('See you at 4'))
    await waitFor(() => expect(screen.queryByLabelText('Edit message')).not.toBeInTheDocument())
  })

  it('deletes for everyone only after a second click', async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    show({ canDelete: true }, { onReply: vi.fn(), onDelete })

    await userEvent.click(screen.getByRole('button', { name: 'Delete this message for everyone' }))
    expect(onDelete).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalled())
  })

  it('offers no edit or delete for a message from the parent', () => {
    show({}, { onReply: vi.fn(), onReact: vi.fn() }, { ...ours, message_type: 0 })

    expect(screen.queryByRole('button', { name: 'Edit this message' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete this message for everyone' })).not.toBeInTheDocument()
  })

  it('stars and forwards a message', async () => {
    const onStar = vi.fn()
    const onForward = vi.fn()
    show({}, { onStar, onForward })

    await userEvent.click(screen.getByRole('button', { name: 'Star this message' }))
    await userEvent.click(screen.getByRole('button', { name: 'Forward this message' }))

    expect(onStar).toHaveBeenCalled()
    expect(onForward).toHaveBeenCalled()
  })

  it('marks a starred message, and offers to take the star off', () => {
    show({ starred: true }, { onStar: vi.fn() })

    expect(screen.getByLabelText('Starred')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove the star from this message' })).toBeInTheDocument()
  })
})
