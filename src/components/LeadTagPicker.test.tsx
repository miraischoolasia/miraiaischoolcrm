import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadTagPicker } from './LeadTagPicker'
import { TAG_COLORS } from '../lib/leadTags'
import type { LeadOption } from '../types/domain'

const tag = (id: number, label: string, patch: Partial<LeadOption> = {}): LeadOption => ({
  id,
  kind: 'tag',
  label,
  isActive: true,
  legacyKey: null,
  color: '#3b82f6',
  ...patch,
})

const tags = [tag(1, 'Hot'), tag(2, 'Warm'), tag(3, 'Old campaign', { isActive: false })]

function renderPicker(selectedIds: number[] = [], onCreate = vi.fn()) {
  const onChange = vi.fn()
  render(
    <LeadTagPicker tags={tags} selectedIds={selectedIds} onChange={onChange} onCreate={onCreate} />,
  )
  return { onChange, onCreate }
}

describe('LeadTagPicker', () => {
  it('says so when the lead has no tags', () => {
    renderPicker()
    expect(screen.getByText('No tags yet.')).toBeInTheDocument()
  })

  it('adds a tag that exists from the list', async () => {
    const { onChange } = renderPicker([1])

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), 'Warm')

    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  it('offers only the visible tags that are not on the lead yet', () => {
    renderPicker([1])

    const names = within(screen.getByLabelText('Add a tag'))
      .getAllByRole('option')
      .map((entry) => entry.textContent)
    expect(names).toEqual(['Add a tag...', 'Warm', '+ Create new tag...'])
  })

  it('still shows a hidden tag the lead already has, and can take it off', async () => {
    const { onChange } = renderPicker([3, 1])

    expect(screen.getByText('Old campaign')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag Old campaign' }))

    expect(onChange).toHaveBeenCalledWith([1])
  })

  it('creates a new tag with a name and a colour, and puts it on the lead', async () => {
    const created = tag(9, 'VIP', { color: TAG_COLORS[5] })
    const onCreate = vi.fn().mockResolvedValue(created)
    const { onChange } = renderPicker([1], onCreate)

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), '+ Create new tag...')
    await userEvent.type(screen.getByLabelText('New tag name'), 'VIP')
    await userEvent.click(screen.getByRole('radio', { name: TAG_COLORS[5] }))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onCreate).toHaveBeenCalledWith('VIP', TAG_COLORS[5])
    expect(onChange).toHaveBeenCalledWith([1, 9])
    // Back to the list, ready for the next one.
    expect(await screen.findByLabelText('Add a tag')).toBeInTheDocument()
  })

  it('suggests a colour no tag uses yet', async () => {
    renderPicker()

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), '+ Create new tag...')

    // The tags above use #3b82f6, so the first free colour is the first one.
    expect(screen.getByRole('radio', { name: TAG_COLORS[0] })).toBeChecked()
  })

  it('adds the tag on Enter without saving the whole lead form', async () => {
    const onCreate = vi.fn().mockResolvedValue(tag(9, 'VIP'))
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <LeadTagPicker tags={tags} selectedIds={[]} onChange={vi.fn()} onCreate={onCreate} />
      </form>,
    )

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), '+ Create new tag...')
    await userEvent.type(screen.getByLabelText('New tag name'), 'VIP{Enter}')

    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('stays open with the name when the tag could not be added', async () => {
    const onCreate = vi.fn().mockResolvedValue(null)
    const { onChange } = renderPicker([], onCreate)

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), '+ Create new tag...')
    await userEvent.type(screen.getByLabelText('New tag name'), 'Hot')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('New tag name')).toHaveValue('Hot')
  })

  it('does not add a blank name, and Cancel goes back to the list', async () => {
    const { onCreate } = renderPicker()

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), '+ Create new tag...')
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Add a tag')).toBeInTheDocument()
  })
})
