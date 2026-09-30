import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadOptionsModal } from './LeadOptionsModal'
import type { LeadOption } from '../../types/domain'

const other: LeadOption = { id: 5, kind: 'source', label: 'Other', isActive: true, legacyKey: 'other' }

function renderModal(overrides: Partial<Parameters<typeof LeadOptionsModal>[0]> = {}) {
  const props = {
    options: [other],
    error: null,
    onClose: vi.fn(),
    onAdd: vi.fn(async () => null),
    onRename: vi.fn(async () => true),
    onSetActive: vi.fn(),
    ...overrides,
  }
  render(<LeadOptionsModal {...props} />)
  return props
}

describe('LeadOptionsModal', () => {
  it('renames a name when Enter is pressed', async () => {
    const props = renderModal()

    const input = screen.getByRole('textbox', { name: 'Rename Other' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Others{Enter}')

    expect(props.onRename).toHaveBeenCalledWith(other, 'Others')
  })

  it('hides a name and adds a new PIC', async () => {
    const props = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Hide Other' }))
    expect(props.onSetActive).toHaveBeenCalledWith(other, false)

    await userEvent.type(screen.getByRole('textbox', { name: 'New PIC name' }), 'Mei{Enter}')
    expect(props.onAdd).toHaveBeenCalledWith('pic', 'Mei')
  })
})
