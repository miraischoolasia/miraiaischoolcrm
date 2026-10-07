import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadOptionsModal } from './LeadOptionsModal'
import type { LeadOption } from '../../types/domain'

const other: LeadOption = { id: 5, kind: 'source', label: 'Other', isActive: true, legacyKey: 'other', color: null }

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

describe('LeadOptionsModal tags and tick columns', () => {
  const tag: LeadOption = {
    id: 7,
    kind: 'tag',
    label: 'Hot',
    isActive: true,
    legacyKey: null,
    color: '#ef4444',
  }
  const check = (slot: number, label: string): LeadOption => ({
    id: 100 + slot,
    kind: 'check',
    label,
    isActive: true,
    legacyKey: `check_${slot}`,
    color: null,
  })

  it('adds a tag with the colour that was picked', async () => {
    const props = renderModal({ options: [other, tag] })

    const colour = screen.getByLabelText('Colour of the new Tags name')
    fireEvent.change(colour, { target: { value: '#22c55e' } })
    await userEvent.type(screen.getByRole('textbox', { name: 'New Tags name' }), 'VIP{Enter}')

    expect(props.onAdd).toHaveBeenCalledWith('tag', 'VIP', '#22c55e')
  })

  it('suggests a colour that no tag uses yet', () => {
    renderModal({ options: [other, tag] })

    expect(screen.getByLabelText('Colour of the new Tags name')).not.toHaveValue('#ef4444')
  })

  it('changes a tag colour once the picker is closed, not while it is dragged', () => {
    const onSetColor = vi.fn()
    renderModal({ options: [other, tag], onSetColor })

    const colour = screen.getByLabelText('Colour of Hot')
    fireEvent.change(colour, { target: { value: '#3b82f6' } })
    fireEvent.change(colour, { target: { value: '#22c55e' } })
    expect(onSetColor).not.toHaveBeenCalled()

    fireEvent.blur(colour)
    expect(onSetColor).toHaveBeenCalledTimes(1)
    expect(onSetColor).toHaveBeenCalledWith(tag, '#22c55e')
  })

  it('renames and hides a tag like any other name', async () => {
    const props = renderModal({ options: [other, tag] })

    await userEvent.click(screen.getByRole('button', { name: 'Hide Hot' }))
    expect(props.onSetActive).toHaveBeenCalledWith(tag, false)

    const input = screen.getByRole('textbox', { name: 'Rename Hot' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Very hot{Enter}')
    expect(props.onRename).toHaveBeenCalledWith(tag, 'Very hot')
  })

  it('lets the three tick columns be renamed but not added or hidden', async () => {
    const props = renderModal({
      options: [other, check(1, 'Follow up 1'), check(2, 'Follow up 2'), check(3, 'Follow up 3')],
    })

    const section = screen.getByRole('region', { name: 'Tick columns' })
    expect(within(section).getAllByRole('textbox')).toHaveLength(3)
    expect(within(section).queryByRole('button')).not.toBeInTheDocument()

    const first = within(section).getByRole('textbox', { name: 'Rename Follow up 1' })
    await userEvent.clear(first)
    await userEvent.type(first, 'RM99 pack{Enter}')
    expect(props.onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }), 'RM99 pack')
  })

  it('leaves out the tick columns until the database has them', () => {
    renderModal({ options: [other] })

    expect(screen.queryByRole('region', { name: 'Tick columns' })).not.toBeInTheDocument()
  })
})
