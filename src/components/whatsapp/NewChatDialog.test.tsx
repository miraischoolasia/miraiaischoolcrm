import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lead } from '../../types/domain'
import { NewChatDialog } from './NewChatDialog'

const lead = {
  id: 11,
  fullName: 'Mei Ling',
  phone: '012-345 6789',
  children: [{ name: 'Ethan', age: 9, phone: null }],
} as Lead
const leadWithoutPhone = { id: 12, fullName: 'No Phone', phone: null, children: [] } as unknown as Lead

function setup(onStart = vi.fn().mockResolvedValue(null)) {
  const onClose = vi.fn()
  render(<NewChatDialog leads={[lead, leadWithoutPhone]} onClose={onClose} onStart={onStart} />)
  return { onStart, onClose }
}

describe('NewChatDialog', () => {
  it('starts a chat with a typed number and closes', async () => {
    const { onStart, onClose } = setup()

    await userEvent.type(screen.getByLabelText('Phone number'), '012 345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Start chat' }))

    await waitFor(() => expect(onStart).toHaveBeenCalledWith({ phone: '012 345 6789', name: '', leadId: null }))
    expect(onClose).toHaveBeenCalled()
  })

  it('fills the number and name from a lead, and ties the chat to it', async () => {
    const { onStart } = setup()

    await userEvent.type(screen.getByLabelText('Find a lead'), 'mei')
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling/ }))
    expect(screen.getByLabelText('Phone number')).toHaveValue('012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Start chat' }))

    await waitFor(() => expect(onStart).toHaveBeenCalledWith({ phone: '012-345 6789', name: 'Mei Ling', leadId: 11 }))
  })

  it('does not offer a lead that has no phone number', async () => {
    setup()

    await userEvent.type(screen.getByLabelText('Find a lead'), 'no phone')

    expect(screen.getByText('No lead with a phone number found.')).toBeInTheDocument()
  })

  it('asks for a full number before doing anything', async () => {
    const { onStart } = setup()

    await userEvent.type(screen.getByLabelText('Phone number'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Start chat' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter the full number')
    expect(onStart).not.toHaveBeenCalled()
  })

  it('stays open and shows the reason when the chat could not be started', async () => {
    const { onClose } = setup(vi.fn().mockResolvedValue("Couldn't start the chat."))

    await userEvent.type(screen.getByLabelText('Phone number'), '0123456789')
    await userEvent.click(screen.getByRole('button', { name: 'Start chat' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't start the chat.")
    expect(onClose).not.toHaveBeenCalled()
  })
})
