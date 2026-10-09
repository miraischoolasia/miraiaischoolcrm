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
