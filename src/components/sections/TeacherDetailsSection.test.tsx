import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TeacherDetailsSection, type TeacherDetailsSectionProps } from './TeacherDetailsSection'
import type { StudentRow } from '../../lib/studentRows'
import type { TeacherClassCard } from '../../lib/teacherDetails'
import type { AgendaItem } from '../../lib/teacherAgenda'
import type { Classroom, Teacher } from '../../types/domain'

const today = '2026-10-14'

const teacher: Teacher = {
  id: 9, authUserId: 'u', username: 'jiahui', fullName: 'Ho Jia Hui', email: 'jh@example.com', phone: '012-345 6789',
  role: 'teacher', isActive: true, permissions: {},
}

function room(id: number, name: string, zoomLink: string | null): Classroom {
  return {
    id, name, category: 'regular', ageGroup: '9-11 Years Old', programLevel: 'Coder Pro', teacherId: 9,
    status: 'active', notes: null, archivedAt: null, zoomLink,
  }
}

function student(id: number, name: string, extra: { dateOfBirth?: string | null; age?: number | null; issue?: boolean } = {}): StudentRow {
  return {
    student: {
      id, name, classroomId: 1, isActive: true, remainingHours: 12, lessonExpiryDate: '2027-01-31',
      dateOfBirth: extra.dateOfBirth ?? null, age: extra.age ?? null, studentType: 'regular',
    },
    kind: 'regular',
    pkg: { name: '12 Months' },
    parent: { name: 'Aisha', phone: '012-111 2233' },
    issues: extra.issue ? [{ label: 'Classes low', tone: 'warning', severity: 2 }] : [],
    needsFollowUp: Boolean(extra.issue),
  } as unknown as StudentRow
}

const classes: TeacherClassCard[] = [
  {
    classroom: room(1, 'TUE C004', 'https://zoom.us/j/123'),
    slots: ['Tue 8:30 pm-10:00 pm'],
    isTrialSlot: false,
    group: 'regular',
    students: [
      student(1, 'Mia Tan', { dateOfBirth: '2016-03-01' }),
      student(2, 'Ben Lim', { dateOfBirth: '2017-05-09', issue: true }),
      student(3, 'Zoe Ng'),
    ],
  },
  { classroom: room(2, 'THU C001', null), slots: ['Thu 4:00 pm-5:30 pm'], isTrialSlot: false, group: 'regular', students: [student(4, 'Chloe Lee', { age: 8 })] },
]

function renderDetails(props: Partial<TeacherDetailsSectionProps> = {}) {
  const handlers = {
    onBack: vi.fn(), onEditTeacher: vi.fn(), onOpenStudent: vi.fn(), onEditClassroom: vi.fn(), onOpenAttendance: vi.fn(),
  }
  render(
    <TeacherDetailsSection
      teacher={teacher}
      classes={classes}
      weekItems={[]}
      weekStart="2026-10-12"
      weekHours={4.5}
      missingAttendance={2}
      todayString={today}
      canEditClassroom
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('TeacherDetailsSection', () => {
  it('groups regular classes apart from the other courses and counts each group', () => {
    const hoa: TeacherClassCard = {
      classroom: { ...room(7, 'HOA 6-8', null), category: 'trial' },
      slots: ['Sat 10:00 am-12:00 pm'],
      isTrialSlot: true,
      group: 'other',
      students: [student(9, 'Jayden Chong')],
    }
    renderDetails({ classes: [...classes, hoa] })

    expect(screen.getByRole('heading', { name: 'Regular classes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Other courses (HOA and camps)' })).toBeInTheDocument()
    expect(screen.getByText('2 classes · 4 students')).toBeInTheDocument()
    expect(screen.getByText('1 class · 1 student')).toBeInTheDocument()
    expect(screen.getByText('HOA')).toBeInTheDocument()
  })

  it('shows the teacher, the counts, and every class closed', () => {
    renderDetails()

    expect(screen.getByRole('heading', { name: 'Ho Jia Hui' })).toBeInTheDocument()
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByText('Ages 9-10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TUE C004/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('opens one class at a time', async () => {
    renderDetails()

    await userEvent.click(screen.getByRole('button', { name: /TUE C004/ }))
    expect(screen.getByRole('button', { name: /TUE C004/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('table')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /THU C001/ }))
    expect(screen.getByRole('button', { name: /TUE C004/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /THU C001/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('table')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: /THU C001/ }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the age from the birth date, the one from booking, and Add when there is none', async () => {
    renderDetails()
    await userEvent.click(screen.getByRole('button', { name: /TUE C004/ }))

    const table = within(screen.getByRole('table'))
    expect(within(table.getByRole('row', { name: /Mia Tan/ })).getByText('10 yrs')).toBeInTheDocument()
    expect(within(table.getByRole('row', { name: /Ben Lim/ })).getByText('9 yrs')).toBeInTheDocument()
    expect(within(table.getByRole('row', { name: /Zoe Ng/ })).getByText('Add')).toBeInTheDocument()
    expect(screen.getByText(/2 students have no date of birth yet/)).toBeInTheDocument()
  })

  it('shows the Zoom link of the class, or says there is none and offers to add one', async () => {
    const { onEditClassroom } = renderDetails()

    await userEvent.click(screen.getByRole('button', { name: /TUE C004/ }))
    expect(screen.getByRole('link', { name: 'https://zoom.us/j/123' })).toHaveAttribute('href', 'https://zoom.us/j/123')

    await userEvent.click(screen.getByRole('button', { name: /THU C001/ }))
    expect(screen.getByText('No Zoom link yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(onEditClassroom).toHaveBeenCalledWith(2)
  })

  it('never turns something that is not an http link into a link', async () => {
    renderDetails({ classes: [{ ...classes[0], classroom: room(1, 'TUE C004', 'javascript:alert(1)') }] })

    await userEvent.click(screen.getByRole('button', { name: /TUE C004/ }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('No Zoom link yet')).toBeInTheDocument()
  })

  it('narrows to the students who need follow-up and opens a student', async () => {
    const { onOpenStudent } = renderDetails()
    await userEvent.click(screen.getByRole('button', { name: /TUE C004/ }))

    await userEvent.click(screen.getByRole('checkbox', { name: 'Needs follow-up only' }))
    const table = within(screen.getByRole('table'))
    expect(table.queryByText('Mia Tan')).not.toBeInTheDocument()
    await userEvent.click(table.getByRole('button', { name: 'Ben Lim' }))
    expect(onOpenStudent).toHaveBeenCalledWith(2)
  })

  it('puts a class on the week strip and opens its attendance', async () => {
    const item = {
      key: 'k', scheduleId: 1, teacherId: 9, date: '2026-10-14', title: 'TUE C004', subtitle: '', classroomId: 1, kind: 'regular',
      startTime: '20:30', endTime: '22:00', makeupMinutes: 0, isMakeupOnly: false, studentCount: 3, log: null,
      editableUntil: null, state: 'open', minutes: 90,
    } as AgendaItem
    const { onOpenAttendance } = renderDetails({ weekItems: [item] })

    const week = within(screen.getByRole('region', { name: 'This week' }))
    await userEvent.click(week.getByRole('button', { name: /TUE C004/ }))
    expect(onOpenAttendance).toHaveBeenCalledWith(item)
  })
})
