import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadModal } from './LeadModal'
import type { LeadFormState, LeadOption } from '../../types/domain'

const tag = (id: number, label: string): LeadOption => ({
  id,
  kind: 'tag',
  label,
  isActive: true,
  legacyKey: null,
  color: '#3b82f6',
})

const formState: LeadFormState = {
  fullName: 'Mrs Lim',
  phone: '60123456789',
  sourceId: '',
  picId: '',
  state: '',
  tagIds: [1],
  status: 'new',
  children: [{ name: 'Ken', age: '9', phone: '' }],
  notes: '',
  addedDate: '2026-10-01',
}

function renderModal(props: Partial<React.ComponentProps<typeof LeadModal>> = {}) {
  const onFieldChange = vi.fn()
  const onAddLeadOption = vi.fn()
  render(
    <LeadModal
      editingLead={null}
      formState={formState}
      saveError={null}
      isSaving={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      onFieldChange={onFieldChange}
      leadOptions={[tag(1, 'Hot'), tag(2, 'VIP')]}
      onAddLeadOption={onAddLeadOption}
      {...props}
    />,
  )
  return { onFieldChange, onAddLeadOption }
}

describe('LeadModal tags', () => {
  it('shows the lead tags under the children', () => {
    renderModal()

    const children = screen.getByText('Children').closest('div[class*="rounded-2xl"]') as HTMLElement
    const tags = within(children).getByText('Tags')
    expect(within(children).getByText('Hot')).toBeInTheDocument()
    // Below the child rows, in the same box.
    const lastChild = within(children).getByDisplayValue('Ken')
    expect(lastChild.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds a tag that exists to the lead', async () => {
    const { onFieldChange } = renderModal()

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), 'VIP')

    expect(onFieldChange).toHaveBeenCalledWith('tagIds', [1, 2])
  })

  it('takes a tag off the lead', async () => {
    const { onFieldChange } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag Hot' }))

    expect(onFieldChange).toHaveBeenCalledWith('tagIds', [])
  })

  it('creates a new tag with its colour whenever it is needed and puts it on the lead', async () => {
    const onAddLeadOption = vi.fn().mockResolvedValue(tag(9, 'Walk-in event'))
    const { onFieldChange } = renderModal({ onAddLeadOption })

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), '+ Create new tag...')
    await userEvent.type(screen.getByLabelText('New tag name'), 'Walk-in event{Enter}')

    expect(onAddLeadOption).toHaveBeenCalledWith('tag', 'Walk-in event', expect.stringMatching(/^#[0-9a-f]{6}$/))
    expect(onFieldChange).toHaveBeenCalledWith('tagIds', [1, 9])
  })

  it('cannot be changed in the view-only profile', () => {
    renderModal({ readOnly: true })

    expect(screen.getByLabelText('Add a tag')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove tag Hot' })).toBeDisabled()
  })
})
