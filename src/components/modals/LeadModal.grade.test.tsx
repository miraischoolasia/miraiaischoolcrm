import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadModal } from './LeadModal'
import type { LeadFormState } from '../../types/domain'

vi.mock('../../lib/ageDisplay', () => ({ useAgeDisplay: () => 'grade' }))

const formState: LeadFormState = {
  fullName: 'Mrs Lim',
  phone: '60123456789',
  sourceId: '',
  picId: '',
  state: '',
  tagIds: [],
  status: 'new',
  children: [{ name: 'Ken', age: '', phone: '', gradeLevel: '' }],
  notes: '',
  addedDate: '2026-10-01',
}

describe('LeadModal for a school that shows grade', () => {
  it('asks for a grade, not an age, and keeps the usual age of the grade', async () => {
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

    expect(screen.queryByText('Age')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Grade of child 1'), 'Year 4')

    expect(onFieldChange).toHaveBeenCalledWith('children', [{ name: 'Ken', age: '10', phone: '', gradeLevel: '4' }])
  })
})
