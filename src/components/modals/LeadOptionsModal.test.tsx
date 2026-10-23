import { fireEvent, render, screen } from '@testing-library/react'
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

  it('hides a name and adds a new source', async () => {
    const props = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Hide Other' }))
    expect(props.onSetActive).toHaveBeenCalledWith(other, false)

    await userEvent.type(screen.getByRole('textbox', { name: 'New Sources name' }), 'Fair{Enter}')
    expect(props.onAdd).toHaveBeenCalledWith('source', 'Fair')
  })

  it('shows the PIC names made from the staff list, read only, and marks an old name not linked yet', () => {
    renderModal({
      options: [
        other,
        { id: 8, kind: 'pic', label: 'Xue Ling', isActive: true, legacyKey: null, color: null, teacherId: 4 },
        { id: 9, kind: 'pic', label: '喵喵小老师', isActive: true, legacyKey: null, color: null, teacherId: null },
        { id: 10, kind: 'pic', label: 'Gone', isActive: false, legacyKey: null, color: null, teacherId: 5 },
      ],
    })

    const pics = screen.getByRole('region', { name: 'PIC' })
    expect(pics).toHaveTextContent('Xue Ling')
    expect(pics).toHaveTextContent('喵喵小老师Not linked')
    expect(pics).not.toHaveTextContent('Gone')
    expect(screen.queryByRole('textbox', { name: 'New PIC name' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Rename Xue Ling' })).not.toBeInTheDocument()
  })
})

describe('LeadOptionsModal tags', () => {
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

  it('no longer offers the Follow up tick columns, even when the database still has them', () => {
    renderModal({ options: [other, check(1, 'Follow up 1'), check(2, 'Follow up 2'), check(3, 'Follow up 3')] })

    expect(screen.queryByRole('region', { name: 'Tick columns' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Rename Follow up 1' })).not.toBeInTheDocument()
  })
})

describe('LeadOptionsModal tag order', () => {
  const tag = (id: number, label: string, isActive = true): LeadOption => ({
    id, kind: 'tag', label, isActive, legacyKey: null, color: '#22c55e',
  })
  const tags = [tag(1, 'Hot'), tag(2, 'Warm'), tag(3, 'Cold'), tag(4, 'Old', false)]

  it('moves a tag with the arrows and keeps the hidden ones after the shown ones', async () => {
    const props = renderModal({ options: tags, onReorder: vi.fn() })

    await userEvent.click(screen.getByRole('button', { name: 'Move Cold up' }))
    expect(props.onReorder).toHaveBeenCalledWith([1, 3, 2, 4])
    expect(screen.getByRole('button', { name: 'Move Hot up' })).toBeDisabled()
  })

  it('moves a tag dropped on another one', () => {
    const props = renderModal({ options: tags, onReorder: vi.fn() })

    const handle = screen.getByRole('textbox', { name: 'Rename Hot' }).closest('li')!.querySelector('[draggable="true"]')!
    fireEvent.dragStart(handle)
    fireEvent.dragOver(screen.getByRole('textbox', { name: 'Rename Cold' }).closest('li')!)
    fireEvent.drop(screen.getByRole('textbox', { name: 'Rename Cold' }).closest('li')!)
    expect(props.onReorder).toHaveBeenCalledWith([2, 3, 1, 4])
  })

  it('shows the hidden tags in their own grey group, without arrows', () => {
    renderModal({ options: tags, onReorder: vi.fn() })

    expect(screen.getByLabelText('Hidden Tags')).toHaveTextContent('Hidden')
    expect(screen.queryByRole('button', { name: 'Move Old up' })).not.toBeInTheDocument()
  })
})
