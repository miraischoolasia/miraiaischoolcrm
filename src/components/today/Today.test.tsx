import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EcToday } from './EcToday'
import { LcToday } from './LcToday'
import { TeacherToday } from './TeacherToday'
import { TeamToday } from './TeamToday'
import type { TodayEc, TodayLc, TodayTeam } from '../../lib/today'

vi.mock('../../lib/supabase', () => ({ supabase: null }))

const ec: TodayEc = {
  available: true,
  leadsOpen: 4,
  leadsNewToday: 1,
  leadsMonth: 9,
  convertedMonth: 2,
  revenueMonth: 2500,
  quotations: [
    { reference: 'Q-AAA', childName: 'Mia', total: 1260, status: 'viewed', leadId: 7, sentOn: '2026-10-20', parentSaidWrong: false },
    { reference: 'Q-BBB', childName: 'Ben', total: 800, status: 'sent', leadId: 8, sentOn: '2026-10-21', parentSaidWrong: true },
  ],
  trialsToday: [{ leadId: 7, childName: 'Mia', startTime: '17:00', className: 'HOA 9-11' }],
}

describe('EC Today', () => {
  it('shows the trials, the unpaid quotations and the month, and opens the lead', async () => {
    const onOpenLead = vi.fn()
    render(<EcToday personId={null} roleName="EC" preloaded={ec} onOpenLead={onOpenLead} onOpenLeads={vi.fn()} followUps={<div>work list</div>} />)
    expect(screen.getByText('work list')).toBeInTheDocument()
    expect(screen.getByText('17:00 · Mia')).toBeInTheDocument()
    expect(screen.getByText(/Mia · RM 1,260/)).toBeInTheDocument()
    expect(screen.getByText('Details wrong')).toBeInTheDocument()
    expect(screen.getByText('My EC month')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Open lead' })[0])
    expect(onOpenLead).toHaveBeenCalledWith(7)
  })

  it('uses the school\'s own word for the role', () => {
    render(<EcToday personId={null} roleName="Sales" preloaded={ec} onOpenLead={vi.fn()} onOpenLeads={vi.fn()} />)
    expect(screen.getByText('My Sales month')).toBeInTheDocument()
  })

  it('draws nothing when there is nothing to show', () => {
    const { container } = render(
      <EcToday
        personId={null}
        roleName="EC"
        preloaded={{ ...ec, available: false, quotations: [], trialsToday: [] }}
        onOpenLead={vi.fn()}
        onOpenLeads={vi.fn()}
      />,
    )
    expect(container.querySelectorAll('section')).toHaveLength(0)
  })
})

const lc: TodayLc = {
  available: true,
  students: 20,
  staysAdded: 3,
  staysStopped: 1,
  atRisk: [{ studentId: 5, name: 'Lee', why: 'Absent twice in a row', lessonDate: '2026-10-22' }],
  expiring: [{ studentId: 6, name: 'Tan', endsOn: '2026-10-30', lessonsLeft: 1 }],
  absentToday: [],
  birthdays: [],
  cardsDue: 12,
  cardsSent: 8,
}

describe('LC Today', () => {
  it('shows only the cards that have something, and opens the student', async () => {
    const onOpenStudent = vi.fn()
    render(<LcToday personId={null} roleName="LC" preloaded={lc} onOpenStudent={onOpenStudent} />)
    expect(screen.getByRole('heading', { name: 'Students at risk' })).toBeInTheDocument()
    expect(screen.getByText('Package ending')).toBeInTheDocument()
    expect(screen.queryByText('Absent today')).not.toBeInTheDocument()
    expect(screen.queryByText('Birthdays today')).not.toBeInTheDocument()
    expect(screen.getByText('8 / 12')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Open student' })[0])
    expect(onOpenStudent).toHaveBeenCalledWith(5)
  })

  it('draws nothing when the database sends nothing', () => {
    const { container } = render(<LcToday personId={null} roleName="LC" preloaded={null} onOpenStudent={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

const team: TodayTeam = {
  approvals: [{ reference: 'Q-CCC', childName: 'Ng', total: 900, discountAmount: 120, leadId: 3, salesPersonId: 2 }],
  people: [
    { teacherId: 2, name: 'Mei', role: 'staff', isEc: true, isLc: false, overdueFollowups: 7, convertedMonth: 9, students: 0, atRisk: 0, lessonsToday: 0, notTaken: 0 },
    { teacherId: 3, name: 'Cyrus', role: 'teacher', isEc: false, isLc: false, overdueFollowups: 0, convertedMonth: 0, students: 0, atRisk: 0, lessonsToday: 5, notTaken: 1 },
    { teacherId: 4, name: 'Nobody', role: 'staff', isEc: false, isLc: false, overdueFollowups: 0, convertedMonth: 0, students: 0, atRisk: 0, lessonsToday: 0, notTaken: 0 },
  ],
}

describe('Team Today', () => {
  it('lists the approvals and the people who have a job, and opens a person', async () => {
    const onOpenPerson = vi.fn()
    render(<TeamToday preloaded={team} onOpenLead={vi.fn()} onOpenPerson={onOpenPerson} />)
    expect(screen.getByText('Waiting for you to approve')).toBeInTheDocument()
    expect(screen.getByText('Mei')).toBeInTheDocument()
    expect(screen.getByText('Cyrus')).toBeInTheDocument()
    expect(screen.queryByText('Nobody')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mei' }))
    expect(onOpenPerson).toHaveBeenCalledWith(2)
  })

  it('draws nothing when there is no reply', () => {
    const { container } = render(<TeamToday preloaded={null} onOpenLead={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Teacher Today', () => {
  it('puts the students to watch first and keeps the teacher page', async () => {
    const onOpenStudent = vi.fn()
    render(
      <TeacherToday
        personId={null}
        onOpenStudent={onOpenStudent}
        preloaded={{ watch: [{ studentId: 9, name: 'Lee', why: 'Absent twice', lessonDate: '2026-10-22', className: 'F3 Science' }] }}
      >
        <div>the teacher page</div>
      </TeacherToday>,
    )
    expect(screen.getByText('Students to watch')).toBeInTheDocument()
    expect(screen.getByText('the teacher page')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open student' }))
    expect(onOpenStudent).toHaveBeenCalledWith(9)
  })

  it('adds nothing when nobody needs watching', () => {
    render(
      <TeacherToday personId={null} onOpenStudent={vi.fn()} preloaded={{ watch: [] }}>
        <div>the teacher page</div>
      </TeacherToday>,
    )
    expect(screen.queryByText('Students to watch')).not.toBeInTheDocument()
    expect(screen.getByText('the teacher page')).toBeInTheDocument()
  })
})
