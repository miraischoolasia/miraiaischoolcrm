import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadModal } from './LeadModal'
import type { LeadFormState } from '../../types/domain'

const twoChildren: LeadFormState = {
  fullName: 'Mrs Lim',
  phone: '60123456789',
  sourceId: '',
  picId: '',
  state: '',
  tagIds: [],
  status: 'contacted',
  children: [
    { name: 'Mia', age: '7', phone: '', stage: '' },
    { name: 'Ben', age: '9', phone: '', stage: '' },
  ],
  notes: '',
  addedDate: '2026-10-01',
}

function renderModal(formState: LeadFormState) {
  const onFieldChange = vi.fn()
  render(
    <LeadModal
      editingLead={null}
      formState={formState}
      saveError={null}
      isSaving={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      onFieldChange={onFieldChange}
      leadOptions={[]}
      onAddLeadOption={vi.fn()}
    />,
  )
  return { onFieldChange }
}

describe('LeadModal child stages', () => {
  it('has no stage pick for a lead with one child', () => {
    renderModal({ ...twoChildren, children: [twoChildren.children[0]] })

    expect(screen.queryByLabelText('Stage of child 1')).not.toBeInTheDocument()
  })

  it('lets each child of a family have its own stage', async () => {
    const { onFieldChange } = renderModal(twoChildren)

    await userEvent.selectOptions(screen.getByLabelText('Stage of child 2'), 'trial_scheduled')

    expect(onFieldChange).toHaveBeenCalledWith('children', [
      { name: 'Mia', age: '7', phone: '', stage: '' },
      { name: 'Ben', age: '9', phone: '', stage: 'trial_scheduled' },
    ])
  })

  it('says which stage the family gets from the children', () => {
    renderModal({
      ...twoChildren,
      children: [
        { name: 'Mia', age: '7', phone: '', stage: 'trial_scheduled' },
        { name: 'Ben', age: '9', phone: '', stage: 'trial_completed' },
      ],
    })

    expect(screen.getByText(/The family is Trial Scheduled/)).toBeInTheDocument()
  })
})
