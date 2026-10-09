import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AttendanceModal } from './AttendanceModal'
import { createEmptyAttendanceReviewForm } from '../../lib/mappers'
import type {
  AttendanceReviewFormState,
  AttendanceStatus,
  LessonLogSummary,
  Student,
} from '../../types/domain'

function student(id: number, name: string): Student {
  return {
    id, name, isActive: true, teacherId: 1, classroomId: 1, phone: null, age: 9, remainingHours: 10,
    lessonExpiryDate: '2099-01-01', accountFeeExpiryDate: '2099-01-01', miraiClubExpiryDate: '2099-01-01',
    notes: '', studentType: 'regular',
  }
}

const roster = [student(1, 'Ava Tan'), student(2, 'Chloe Wong'), student(3, 'Zoe Lau')]
const existingLog = { id: 9, revisionNumber: 1, submittedAt: '2026-10-09T10:00:00Z', lessonRemark: null } as LessonLogSummary

function fullReview(overrides: Partial<AttendanceReviewFormState> = {}): AttendanceReviewFormState {
  return {
    ...createEmptyAttendanceReviewForm(),
    logicalThinkingScore: 4, codingCreativityScore: 4, problemSolvingScore: 4, expressivenessScore: 4, sustainedFocusScore: 4,
    ...overrides,
  }
}

function Harness({
  onSubmit = vi.fn(),
  existing = null,
  reviews = {},
  locked = false,
}: {
  onSubmit?: () => void
  existing?: LessonLogSummary | null
  reviews?: Record<number, AttendanceReviewFormState>
  locked?: boolean
}) {
  const [statuses, setStatuses] = useState<Record<number, AttendanceStatus>>({})
  const [forms, setForms] = useState(reviews)
  const form = (current: Record<number, AttendanceReviewFormState>, id: number) =>
    current[id] ?? createEmptyAttendanceReviewForm()

  return (
    <AttendanceModal
      attendanceModal={{ scheduleId: 1, occurrenceDate: '2026-10-09', title: 'FRI C006' }}
      attendanceExistingLog={existing}
      attendanceLocked={locked}
      isLoadingAttendance={false}
      attendanceRoster={roster}
      attendanceStatuses={statuses}
      attendanceReviews={forms}
      attendanceRemark=""
      attendanceSaveError={null}
      isSavingAttendance={false}
      onClose={vi.fn()}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      onSetStatus={(id, status) => setStatuses((current) => ({ ...current, [id]: status }))}
      onUpdateReviewScore={(id, scoreField, remarkField, score) =>
        setForms((current) => ({
          ...current,
          [id]: { ...form(current, id), [scoreField]: score, ...(score >= 3 ? { [remarkField]: '' } : {}) },
        }))
      }
      onUpdateReviewRemark={(id, remarkField, value) =>
        setForms((current) => ({ ...current, [id]: { ...form(current, id), [remarkField]: value } }))
      }
      onUpdateLessonRemark={(id, value) =>
        setForms((current) => ({ ...current, [id]: { ...form(current, id), lessonRemark: value } }))
      }
    />
  )
}

const rateAll = async (stars: number) => {
  for (const button of screen.getAllByRole('button', { name: `Rate ${stars} out of 5` })) {
    await userEvent.click(button)
  }
}
const submit = () => screen.getByRole('button', { name: 'Submit Attendance' })
const reviewToggle = (name: string) =>
  within(screen.getByText(name).closest('div[class*="rounded-2xl"]') as HTMLElement).getByRole('button', {
    name: /Student Performance Review/,
  })

describe('AttendanceModal (new submission)', () => {
  it('opens the first student to review, and counts who is done', async () => {
    render(<Harness />)

    expect(screen.getByText('Reviewed 0 of 3 present students')).toBeInTheDocument()
    expect(reviewToggle('Ava Tan')).toHaveAttribute('aria-expanded', 'true')
    expect(reviewToggle('Chloe Wong')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Still to review: Ava, Chloe, Zoe')).toBeInTheDocument()
    expect(submit()).toBeDisabled()
  })

  it('opens one student at a time', async () => {
    render(<Harness />)

    await userEvent.click(reviewToggle('Chloe Wong'))

    expect(reviewToggle('Chloe Wong')).toHaveAttribute('aria-expanded', 'true')
    expect(reviewToggle('Ava Tan')).toHaveAttribute('aria-expanded', 'false')
  })

  it('needs a remark for a low score before a student counts as reviewed', async () => {
    render(<Harness />)

    await rateAll(4)
    await userEvent.click(screen.getAllByRole('button', { name: 'Rate 2 out of 5' })[1])
    expect(screen.getByText('5 of 5 rated · remark needed')).toBeInTheDocument()
    expect(screen.getByText('Reviewed 0 of 3 present students')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Explain the low score for this metric.'), 'Copied the example')
    expect(screen.getByText('✓ Reviewed')).toBeInTheDocument()
    expect(screen.getByText('Reviewed 1 of 3 present students')).toBeInTheDocument()
  })

  it('moves on with Next student, and lets submit through once everyone present is reviewed', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Attendance for Zoe Lau' })).getByRole('button', { name: 'Absent' }),
    )
    expect(screen.getByText('1 absent or on leave, no review needed')).toBeInTheDocument()

    await rateAll(5)
    await userEvent.click(screen.getByRole('button', { name: 'Next student' }))
    expect(reviewToggle('Chloe Wong')).toHaveAttribute('aria-expanded', 'true')
    await rateAll(3)
    expect(screen.getByText('All set. Ready to submit.')).toBeInTheDocument()
    expect(submit()).toBeEnabled()

    await userEvent.click(submit())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('marks everyone present with one button, and hides the review of someone marked away', async () => {
    render(<Harness />)
    const awayGroup = screen.getByRole('group', { name: 'Attendance for Chloe Wong' })

    await userEvent.click(within(awayGroup).getByRole('button', { name: 'Leave' }))
    expect(within(awayGroup).getByRole('button', { name: 'Leave' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Reviewed 0 of 2 present students')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Mark all present' }))
    expect(within(awayGroup).getByRole('button', { name: 'Present' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Reviewed 0 of 3 present students')).toBeInTheDocument()
  })

  it('lets submit through when everyone is absent', async () => {
    render(<Harness />)

    for (const name of ['Ava Tan', 'Chloe Wong', 'Zoe Lau']) {
      await userEvent.click(
        within(screen.getByRole('group', { name: `Attendance for ${name}` })).getByRole('button', { name: 'Absent' }),
      )
    }

    expect(submit()).toBeEnabled()
  })
})

describe('AttendanceModal (submitted report)', () => {
  it('opens every review so the report can be read, and each can be closed on its own', async () => {
    render(<Harness existing={existingLog} reviews={{ 1: fullReview(), 2: fullReview(), 3: fullReview() }} />)

    expect(reviewToggle('Ava Tan')).toHaveAttribute('aria-expanded', 'true')
    expect(reviewToggle('Zoe Lau')).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(reviewToggle('Ava Tan'))
    expect(reviewToggle('Ava Tan')).toHaveAttribute('aria-expanded', 'false')
    expect(reviewToggle('Chloe Wong')).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows no progress, no Mark all present and no Submit once the report is locked', () => {
    render(<Harness existing={existingLog} locked reviews={{ 1: fullReview(), 2: fullReview(), 3: fullReview() }} />)

    expect(screen.queryByText(/present students$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark all present' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit Attendance' })).not.toBeInTheDocument()
  })
})
