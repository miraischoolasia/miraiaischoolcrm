import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StudentDetailModal } from './StudentDetailModal'
import type {
  Classroom,
  LessonLogStudentReview,
  LessonLogSummary,
  Package,
  Schedule,
  Student,
} from '../types/domain'

const student: Student = {
  id: 1,
  name: 'Ada Lovelace',
  isActive: true,
  teacherId: null,
  classroomId: null,
  phone: null,
  age: null,
  remainingHours: 10,
  lessonExpiryDate: '2099-12-31',
  accountFeeExpiryDate: '2099-12-31',
  miraiClubExpiryDate: '2099-12-31',
  notes: '',
  studentType: 'regular',
}

type Props = Partial<React.ComponentProps<typeof StudentDetailModal>>

function renderModal(props: Props = {}) {
  return render(
    <StudentDetailModal
      classrooms={[]}
      student={student}
      lessonLogs={[]}
      lessonReviews={[]}
      onClose={vi.fn()}
      schedules={[]}
      teacherMap={new Map()}
      {...props}
    />,
  )
}

const openTab = (name: string) => userEvent.click(screen.getByRole('tab', { name }))

const trialPackage: Package = {
  id: 1, name: 'Trial 1 Month', kind: 'trial', classCount: 4, durationMonths: 1, includesFees: false, isActive: true, sortOrder: 1,
}
const sixMonths: Package = {
  id: 2, name: '6 Months', kind: 'regular', classCount: 24, durationMonths: 6, includesFees: true, isActive: true, sortOrder: 2,
}

describe('StudentDetailModal', () => {
  it('is a drawer with Overview, Progress, Lessons and Billing', () => {
    renderModal()

    expect(screen.getByRole('dialog')).toHaveAttribute('data-drawer-shell')
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview', 'Progress', 'Lessons', 'Billing',
    ])
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
  })

  it('offers Edit and Renew in the header when the account may edit students', async () => {
    const onEdit = vi.fn()
    const onRenew = vi.fn()
    renderModal({ onEdit, onRenew })

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Renew' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onRenew).toHaveBeenCalledTimes(1)
  })

  it('has no Edit or Renew button otherwise', () => {
    renderModal()

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument()
  })

  it('shows the parent and phone, and can copy the number', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderModal({ student: { ...student, phone: '60123456789' }, parentName: 'Mrs Tan' })

    expect(screen.getByText('Mrs Tan · 60123456789')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('60123456789')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('says what needs doing at the top of Overview, with Renew', async () => {
    const onRenew = vi.fn()
    renderModal({ student: { ...student, remainingHours: 2, packageId: 2 }, packages: [sixMonths], onRenew })

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Only 2 classes left.')
    expect(screen.getByText('of 24')).toBeInTheDocument()
    await userEvent.click(within(banner).getByRole('button', { name: 'Renew' }))
    expect(onRenew).toHaveBeenCalledTimes(1)
  })

  it('shows no banner for a healthy student, and says when someone is deactivated', () => {
    const { unmount } = renderModal()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()

    renderModal({ student: { ...student, isActive: false } })
    expect(screen.getByText(/Stays in the attendance roster/)).toBeInTheDocument()
  })

  it('lists the package history with the current package under Billing', async () => {
    renderModal({
      student: { ...student, packageId: 2 },
      packages: [trialPackage, sixMonths],
      enrollments: [
        { id: 9, studentId: 1, packageId: 2, startDate: '2026-11-01', endDate: '2027-05-01', classCount: 24, remark: null, createdAt: '' },
        { id: 8, studentId: 1, packageId: 1, startDate: '2026-10-01', endDate: '2026-11-01', classCount: 4, remark: null, createdAt: '' },
      ],
    })
    await openTab('Billing')

    expect(screen.getByText('Now on')).toBeInTheDocument()
    const section = screen.getByRole('heading', { name: 'Package history' }).closest('section') as HTMLElement
    expect([...section.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '6 MonthsNov 1, 2026 - May 1, 2027 · 24 classes',
      'Trial 1 MonthOct 1, 2026 - Nov 1, 2026 · 4 classes',
    ])
  })

  it('shows the lesson, Account Fee and Mirai Club expiry, or that the package has no fees', async () => {
    const { unmount } = renderModal({ student: { ...student, miraiClubExpiryDate: '2026-11-30' } })
    await openTab('Billing')
    expect(screen.getByText('Lesson Expiry')).toBeInTheDocument()
    expect(screen.getByText('Account Fee Expiry')).toBeInTheDocument()
    expect(screen.getByText('Mirai Club Expiry')).toBeInTheDocument()
    expect(screen.getByText('Nov 30, 2026')).toBeInTheDocument()
    unmount()

    renderModal({ student: { ...student, packageId: 1 }, packages: [trialPackage] })
    await openTab('Billing')
    expect(screen.getAllByText('Not in this package')).toHaveLength(2)
  })

  it('offers Change Package under Billing only with a history to correct', async () => {
    const onChangePackage = vi.fn()
    const enrollment = { id: 9, studentId: 1, packageId: 2, startDate: '2026-11-01', endDate: '2027-05-01', classCount: 24, remark: null, createdAt: '' }
    const { unmount } = renderModal({ student: { ...student, packageId: 2 }, packages: [sixMonths], onChangePackage })
    await openTab('Billing')
    expect(screen.queryByRole('button', { name: 'Change Package' })).not.toBeInTheDocument()
    unmount()

    renderModal({ student: { ...student, packageId: 2 }, packages: [sixMonths], enrollments: [enrollment], onChangePackage })
    await openTab('Billing')
    await userEvent.click(screen.getByRole('button', { name: 'Change Package' }))
    expect(onChangePackage).toHaveBeenCalledTimes(1)
  })

  describe('lessons', () => {
    const lessonLogs: LessonLogSummary[] = [
      { id: 1, scheduleId: 1, teacherId: 1, lessonDate: '2026-10-01', lessonRemark: 'Built a game', submittedAt: '', revisionNumber: 1, parentLogId: null },
      { id: 2, scheduleId: 1, teacherId: 1, lessonDate: '2026-10-08', lessonRemark: null, submittedAt: '', revisionNumber: 1, parentLogId: null },
    ]
    const review = {
      id: 1, lessonLogId: 1, studentId: 1,
      logicalThinkingScore: 4, logicalThinkingRemark: null,
      codingCreativityScore: 2, codingCreativityRemark: 'Copied the example',
      problemSolvingScore: 4, problemSolvingRemark: null,
      expressivenessScore: 4, expressivenessRemark: null,
      sustainedFocusScore: 4, sustainedFocusRemark: null,
    } as LessonLogStudentReview
    const schedules = [{ id: 1, title: 'WED C002 class' }] as Schedule[]
    const attendance = [
      { lessonLogId: 1, status: 'present' as const },
      { lessonLogId: 2, status: 'absent' as const },
    ]

    it('lists present and absent lessons newest first, and shows the five scores when one is opened', async () => {
      renderModal({ lessonLogs, lessonReviews: [review], schedules, attendance })
      await openTab('Lessons')

      const rows = [...document.querySelectorAll('details')]
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('Oct 8, 2026')
      expect(rows[0]).toHaveTextContent('Absent')
      expect(rows[1]).toHaveTextContent('Oct 1, 2026')
      expect(rows[1]).toHaveTextContent('3.6')

      expect(within(rows[1]).getByText('Remark: Copied the example')).toBeInTheDocument()
      expect(within(rows[1]).getByText('Class note: Built a game')).toBeInTheDocument()
      expect(within(rows[0]).getByText('Absent: no review for this lesson.')).toBeInTheDocument()
    })

    it('draws an attendance square for each lesson, oldest first', async () => {
      renderModal({ lessonLogs, lessonReviews: [review], schedules, attendance })
      await openTab('Lessons')

      const strip = screen.getByRole('list', { name: 'Attendance, oldest to newest' })
      expect([...strip.querySelectorAll('li')].map((li) => li.getAttribute('aria-label'))).toEqual([
        'Oct 1, 2026: Present',
        'Oct 8, 2026: Absent',
      ])
    })

    it('shows the latest lessons on Overview and jumps to all of them', async () => {
      const many = Array.from({ length: 4 }, (_, index) => ({
        ...lessonLogs[0],
        id: 10 + index,
        lessonDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
      }))
      renderModal({
        lessonLogs: many,
        lessonReviews: [],
        schedules,
        attendance: many.map((log) => ({ lessonLogId: log.id, status: 'present' as const })),
      })

      const recent = screen.getByRole('heading', { name: 'Recent lessons' }).closest('section') as HTMLElement
      expect(recent.querySelectorAll('li')).toHaveLength(3)
      await userEvent.click(within(recent).getByRole('button', { name: 'See all' }))
      expect(screen.getByRole('tab', { name: 'Lessons' })).toHaveAttribute('aria-selected', 'true')
    })

    it('says so when there are no lessons or reviews yet', async () => {
      renderModal()
      await openTab('Lessons')
      expect(screen.getByText('No lessons have been recorded for this student yet.')).toBeInTheDocument()
      await openTab('Progress')
      expect(screen.getByText('No performance reviews have been submitted for this student yet.')).toBeInTheDocument()
    })

    it('shows the make-up records and the button to arrange one', async () => {
      const onArrange = vi.fn()
      renderModal({
        onArrangeMakeup: onArrange,
        makeupPlans: [{
          id: 3, classroomId: null, studentId: 1, missedDate: '2026-10-01', missedMinutes: 90, notes: null,
          sessions: [{ id: 1, sessionDate: '2026-10-08', extraMinutes: 30 }],
        } as never],
      })
      await openTab('Lessons')

      expect(screen.getByText('Missed Oct 1, 2026 · 90 min · This student')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Arrange Make-up' }))
      expect(onArrange).toHaveBeenCalledTimes(1)
    })
  })

  it('shows only Overview for a preview student, with the phone', () => {
    renderModal({ student: { ...student, studentType: 'preview', phone: '60111222333' }, onRenew: vi.fn() })

    expect(screen.queryByRole('tab', { name: 'Progress' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getAllByText('60111222333').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument()
  })

  it('has no Billing for an HOA (trial-type) student', () => {
    renderModal({ student: { ...student, studentType: 'trial' } })

    expect(screen.queryByRole('tab', { name: 'Billing' })).not.toBeInTheDocument()
    expect(screen.getByText('HOA trial class')).toBeInTheDocument()
  })

  it('shows when the student joined their class and lets it be corrected', async () => {
    const room = (id: number, name: string): Classroom => ({
      id,
      name,
      category: 'regular',
      ageGroup: '9-11 Years Old',
      programLevel: 'Coder Pro',
      teacherId: null,
      status: 'active',
      notes: null,
      archivedAt: null,
    })
    const onSetClassStart = vi.fn().mockResolvedValueOnce('Pick a day after they started their previous class.').mockResolvedValueOnce(null)
    renderModal({
      classrooms: [room(8, 'WED Coding Class C002'), room(10, 'TUE Coding Class C004')],
      student: {
        ...student,
        classroomId: 8,
        classPeriods: [
          { classroomId: 10, startDate: null, endDate: '2026-10-01' },
          { classroomId: 8, startDate: '2026-10-01', endDate: null },
        ],
      },
      onSetClassStart,
    })

    expect(screen.getByText('In This Class Since')).toBeInTheDocument()
    expect(screen.getByText(/Earlier: TUE Coding Class C004 until/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Change the day they joined' }))
    fireEvent.change(screen.getByLabelText('Joined the class on'), { target: { value: '2026-09-20' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSetClassStart).toHaveBeenLastCalledWith('2026-09-20')
    expect(await screen.findByRole('alert')).toHaveTextContent('previous class')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Change the day they joined' })).toBeInTheDocument()
  })

  it('has no join-day editing without Students edit', () => {
    renderModal({
      student: { ...student, classroomId: 8, classPeriods: [{ classroomId: 8, startDate: null, endDate: null }] },
    })

    expect(screen.queryByRole('button', { name: 'Change the day they joined' })).not.toBeInTheDocument()
  })
})
