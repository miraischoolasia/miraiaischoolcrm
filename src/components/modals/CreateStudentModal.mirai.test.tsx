import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CreateStudentModal } from './CreateStudentModal'
import type { CreateStudentFormState } from '../../types/domain'

// Mirai (packages and fees, no student codes): the window is as before.

const form: CreateStudentFormState = {
  packageId: '', startDate: '2026-11-01', fullName: 'Ali', phone: '', classroomId: '', initialHours: '0',
  lessonExpiryDate: '2026-11-01', accountFeeExpiryDate: '2026-11-01', miraiClubExpiryDate: '2026-11-01',
  notes: '', studentType: 'regular', dateOfBirth: '',
}

describe('adding a student at Mirai', () => {
  it('keeps the class count, lesson expiry and both fee dates, and no months or code', () => {
    render(
      <CreateStudentModal
        activeVisibleClassrooms={[]}
        teacherMap={new Map()}
        formState={form}
        saveError={null}
        isSaving={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Initial Classes')).toBeInTheDocument()
    expect(screen.getByText('Lesson Expiry Date')).toBeInTheDocument()
    expect(screen.getByText('Account Fee Expiry Date')).toBeInTheDocument()
    expect(screen.getByText('Mirai Club Expiry Date')).toBeInTheDocument()
    expect(screen.queryByText('Months')).not.toBeInTheDocument()
    expect(screen.queryByText('Student Code')).not.toBeInTheDocument()
  })
})
