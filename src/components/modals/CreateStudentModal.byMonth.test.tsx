import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CreateStudentFormState } from '../../types/domain'

// A school that charges by the month and has no fees (EduHero): the class's first day and months,
// no class count, no lesson expiry, no Account Fee or membership.
vi.mock('../../lib/brand', () => ({
  brand: {
    name: 'EduHero', clubName: 'Membership', usesFees: false, usesPackages: false,
    usesMiraiArt: false, logo: null, favicon: null, company: '', loginHint: '',
  },
}))

const { CreateStudentModal } = await import('./CreateStudentModal')

const form: CreateStudentFormState = {
  packageId: '', startDate: '2026-11-01', fullName: 'Ali', phone: '', classroomId: '', initialHours: '0',
  lessonExpiryDate: '2026-11-01', accountFeeExpiryDate: '2026-11-01', miraiClubExpiryDate: '2026-11-01',
  notes: '', studentType: 'regular', dateOfBirth: '', months: '3', studentCode: '',
}

function renderModal(showStudentCode = false) {
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
      showStudentCode={showStudentCode}
    />,
  )
}

describe('adding a student at a school that charges by the month', () => {
  it('asks for the first day and months, and works out the end', () => {
    renderModal()

    expect(screen.getByText('First Day')).toBeInTheDocument()
    expect(screen.getByText('Months')).toBeInTheDocument()
    expect(screen.getByText(/ends Jan 31, 2027/)).toBeInTheDocument()
    expect(screen.queryByText('Initial Classes')).not.toBeInTheDocument()
    expect(screen.queryByText('Lesson Expiry Date')).not.toBeInTheDocument()
  })

  it('never shows the Account Fee or a membership fee', () => {
    renderModal()

    expect(screen.queryByText(/Account Fee/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Membership/)).not.toBeInTheDocument()
  })

  it('shows the student code box only when the school uses codes', () => {
    renderModal(false)
    expect(screen.queryByText('Student Code')).not.toBeInTheDocument()
  })

  it('with codes switched on, asks for the code', () => {
    renderModal(true)
    expect(screen.getByText('Student Code')).toBeInTheDocument()
  })
})
