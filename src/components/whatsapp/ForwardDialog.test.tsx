import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ForwardDialog } from './ForwardDialog'

const targets = [
  { id: 1, title: 'Mei Ling', subtitle: '+60 12-345 6789' },
  { id: 2, title: 'Aisha', subtitle: '+60 19-888 7777' },
  { id: 3, title: 'WhatsApp user', subtitle: 'Number hidden by WhatsApp' },
]

describe('ForwardDialog', () => {
  it('shows what is forwarded and sends to every chat ticked', async () => {
    const onForward = vi.fn().mockResolvedValue(null)
    const onClose = vi.fn()
    render(<ForwardDialog targets={targets} preview="See you at 2" onClose={onClose} onForward={onForward} />)

    expect(screen.getByText('See you at 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /Mei Ling/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Aisha/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Forward to 2 chats' }))

    await waitFor(() => expect(onForward).toHaveBeenCalledWith([1, 2]))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('finds a chat by name or number', async () => {
    render(<ForwardDialog targets={targets} preview="x" onClose={vi.fn()} onForward={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Search chats'), '888')

    expect(screen.getByText('Aisha')).toBeInTheDocument()
    expect(screen.queryByText('Mei Ling')).not.toBeInTheDocument()
  })

  it('stays open and says why when it could not be sent', async () => {
    const onClose = vi.fn()
    render(<ForwardDialog targets={targets} preview="x" onClose={onClose} onForward={vi.fn().mockResolvedValue('Could not send.')} />)

    await userEvent.click(screen.getByRole('checkbox', { name: /Mei Ling/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send.')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ForwardDialog order', () => {
  it('lists the chat written to most recently first', () => {
    const recent = [
      { id: 1, title: 'Old chat', subtitle: 'a', lastActivity: 1000 },
      { id: 2, title: 'Newest chat', subtitle: 'b', lastActivity: 3000 },
      { id: 3, title: 'Middle chat', subtitle: 'c', lastActivity: 2000 },
    ]
    render(<ForwardDialog targets={recent} preview="x" onClose={vi.fn()} onForward={vi.fn()} />)

    const names = screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent ?? '')
    expect(names[0]).toContain('Newest chat')
    expect(names[1]).toContain('Middle chat')
    expect(names[2]).toContain('Old chat')
  })
})

describe('ForwardDialog and Facebook / Instagram', () => {
  it('greys a Messenger chat outside the 24 hours, with the reason, so it cannot be picked (2026-10-20)', async () => {
    const onForward = vi.fn().mockResolvedValue(null)
    const social = [
      { id: 1, title: 'Mei Ling', subtitle: 'a', channel: 'Messenger', blocked: 'Facebook and Instagram only let the school write within 24 hours.' },
      { id: 2, title: 'Aisha', subtitle: 'b', channel: 'Messenger' },
    ]
    render(<ForwardDialog targets={social} preview="x" onClose={vi.fn()} onForward={onForward} />)

    const late = screen.getByRole('checkbox', { name: /Mei Ling/ })
    expect(late).toBeDisabled()
    expect(screen.getByText(/only let the school write within 24 hours/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Aisha/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }))
    await waitFor(() => expect(onForward).toHaveBeenCalledWith([2]))
  })

  it('keeps only the chats that did not get it ticked, so a second press sends no copy twice', async () => {
    const onForward = vi.fn().mockResolvedValueOnce({ message: 'Sent to 1 of 2 chats. Not sent to: Aisha: It did not go through.', failedIds: [2] })
    render(<ForwardDialog targets={targets} preview="x" onClose={vi.fn()} onForward={onForward} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Mei Ling/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Aisha/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Forward to 2 chats' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Aisha: It did not go through.')
    expect(screen.getByRole('checkbox', { name: /Mei Ling/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Aisha/ })).toBeChecked()
  })
})
