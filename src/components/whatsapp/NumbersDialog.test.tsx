import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumbersDialog } from './NumbersDialog'

const main = { id: 1, label: 'Main', phone: '60108079133', inboxId: 1, instance: 'mirai-test', isActive: true }

function setup(overrides: Partial<Parameters<typeof NumbersDialog>[0]> = {}) {
  const props = {
    numbers: [main],
    assignments: new Map([[1, [7]]]),
    staff: [
      { id: 7, name: 'Amy' },
      { id: 8, name: 'Ben' },
    ],
    inboxes: [
      { id: 1, name: 'Mirai' },
      { id: 2, name: 'Mirai Sales' },
    ],
    onSave: vi.fn(async () => null as string | null),
    onRemove: vi.fn(async () => null as string | null),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<NumbersDialog {...props} />)
  return props
}

describe('NumbersDialog', () => {
  it('lists each number with the staff it is given to', () => {
    setup()
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Given to: Amy')).toBeInTheDocument()
  })

  it('adds a number and gives it to the ticked staff', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add a number' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Sales')
    await userEvent.selectOptions(screen.getByLabelText('Chatwoot inbox'), '2')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ben' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }))

    expect(onSave).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ label: 'Sales', inboxId: 2, isActive: true }),
      [8],
    )
    // Back to the list after saving.
    expect(screen.getByRole('button', { name: 'Add a number' })).toBeInTheDocument()
  })

  it('keeps the form open and says why when the save fails', async () => {
    setup({ onSave: vi.fn(async () => 'This inbox is already used by another number.') })
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already used')
  })

  it('asks twice before removing a number', async () => {
    const { onRemove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Really remove?' }))
    expect(onRemove).toHaveBeenCalledWith(main)
  })
})
