import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminHomeSection, type AdminHomeSectionProps } from './AdminHomeSection'
import type { StudentRow } from '../../lib/studentRows'
import type { AgendaItem, TeacherAgenda } from '../../lib/teacherAgenda'
import type { Lead } from '../../types/domain'

const today = '2026-10-13'
// Tuesday 3:10 pm.
const now = new Date(2026, 9, 13, 15, 10)

function item(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    key: 'k', scheduleId: 1, teacherId: 9, date: today, title: 'TUE C001', subtitle: '', classroomId: 1, kind: 'regular',
    startTime: '16:00', endTime: '17:30', makeupMinutes: 0, isMakeupOnly: false, studentCount: 4, log: null,
    editableUntil: null, state: 'open', minutes: 90, ...overrides,
  }
}

const emptyAgenda: TeacherAgenda = { today: [], todo: [], upcoming: [], week: { classes: 0, hours: 0 } }

function renderHome(props: Partial<AdminHomeSectionProps> = {}) {
  const handlers = {
    onTakeAttendance: vi.fn(),
    onOpenCalendar: vi.fn(),
    onOpenStudent: vi.fn(),
    onRenewStudent: vi.fn(),
    onOpenFollowUpStudents: vi.fn(),
    onOpenLeads: vi.fn(),
    onOpenLeadTasks: vi.fn(),
    onOpenForms: vi.fn(),
    onOpenWhatsApp: vi.fn(),
    onOpenAutomations: vi.fn(),
  }
  render(
    <AdminHomeSection
      adminName="Alex"
      todayString={today}
      now={now}
      teacherNames={new Map([[9, 'Ms Rachel']])}
      agenda={null}
      studentRows={null}
      leads={null}
      unreadForms={null}
      whatsApp={null}
      automations={null}
      canRenew
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('AdminHomeSection', () => {
  it('greets the admin and draws only the blocks the account can use', () => {
    renderHome({ agenda: emptyAgenda })

    expect(screen.getByRole('heading', { name: 'Good afternoon, Alex' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Classes today' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Students to follow up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Leads' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Inbox & automations' })).not.toBeInTheDocument()
  })

  it("lists today's classes with the teacher and opens the attendance", async () => {
    const open = item({ key: 'a', title: 'TUE C001' })
    const done = item({ key: 'b', title: 'TUE C002', state: 'submitted', startTime: '14:00', endTime: '15:00' })
    const { onTakeAttendance } = renderHome({
      agenda: { ...emptyAgenda, today: [done, open] },
    })

    const block = screen.getByRole('region', { name: 'Classes today' })
    expect(within(block).getByText('2 classes · 1 attendance submitted')).toBeInTheDocument()
    expect(within(block).getByText('✓ Submitted')).toBeInTheDocument()
    expect(within(block).getAllByText(/Ms Rachel · 4 students/)).toHaveLength(2)

    await userEvent.click(within(block).getByRole('button', { name: 'Attendance' }))
    expect(onTakeAttendance).toHaveBeenCalledWith(open)
  })

  it('shows who has not submitted attendance and lets the admin take it', async () => {
    const missed = item({ key: 'm', title: 'MON C003', date: '2026-10-12', state: 'missing' })
    const { onTakeAttendance } = renderHome({ agenda: { ...emptyAgenda, todo: [missed] } })

    const block = screen.getByRole('region', { name: 'Classes today' })
    expect(within(block).getByText('1 earlier class without attendance')).toBeInTheDocument()
    expect(within(block).getByText('Ms Rachel · 1')).toBeInTheDocument()
    await userEvent.click(within(block).getByRole('button', { name: 'Take attendance' }))
    expect(onTakeAttendance).toHaveBeenCalledWith(missed)
  })

  it('lists students to follow up and renews one', async () => {
    const rows = [
      {
        student: { id: 5, name: 'Mia' },
        issues: [{ label: 'Package ended', tone: 'critical', severity: 1 }],
        rank: 1,
        needsFollowUp: true,
        kind: 'regular',
        classroom: { name: 'WED C002' },
        parent: { name: 'Aisha', phone: '60123' },
      },
    ] as unknown as StudentRow[]
    const { onRenewStudent, onOpenStudent } = renderHome({ studentRows: rows })

    const block = screen.getByRole('region', { name: 'Students to follow up' })
    expect(within(block).getByText('1 need follow-up · 1 urgent')).toBeInTheDocument()
    expect(within(block).getByText('Package ended')).toBeInTheDocument()
    await userEvent.click(within(block).getByRole('button', { name: 'Renew' }))
    expect(onRenewStudent).toHaveBeenCalledWith(5)
    await userEvent.click(within(block).getByRole('button', { name: 'Mia' }))
    expect(onOpenStudent).toHaveBeenCalledWith(5)
  })

  it('shows lead tasks that are due, untouched leads and new forms', async () => {
    const leads = [
      {
        id: 7, fullName: 'Aisha', phone: null, status: 'new', children: [], followUps: [],
        tasks: [{ id: 't', title: 'Call back', dueDate: '2026-10-11', completed: false }],
      },
    ] as unknown as Lead[]
    const { onOpenLeadTasks, onOpenForms } = renderHome({ leads, unreadForms: 3 })

    const block = screen.getByRole('region', { name: 'Leads' })
    expect(within(block).getByText('Call back')).toBeInTheDocument()
    expect(within(block).getByText('2 days late')).toBeInTheDocument()
    expect(within(block).getByRole('button', { name: '1 new lead with no follow-up' })).toBeInTheDocument()
    await userEvent.click(within(block).getByRole('button', { name: 'Open' }))
    expect(onOpenLeadTasks).toHaveBeenCalledWith(7)
    await userEvent.click(within(block).getByRole('button', { name: '3 new form submissions' }))
    expect(onOpenForms).toHaveBeenCalled()
  })

  it('shows unread chats, late chats and the automation approvals', async () => {
    const { onOpenWhatsApp, onOpenAutomations } = renderHome({
      whatsApp: { unread: 4, waiting: 2 },
      automations: {
        unavailable: false,
        summary: { waiting: 6, failed: 1, sentToday: 12, settings: { paused: true, dailyCap: 40, gapSeconds: 30 } },
      },
    })

    const block = screen.getByRole('region', { name: 'Inbox & automations' })
    expect(within(block).getByText('4 unread chats')).toBeInTheDocument()
    expect(within(block).getByText('2 waiting over 30 minutes')).toBeInTheDocument()
    expect(within(block).getByText('6 messages waiting for approval')).toBeInTheDocument()
    expect(within(block).getByText('Sent today 12 of 40')).toBeInTheDocument()
    expect(within(block).getByText('Paused')).toBeInTheDocument()
    expect(within(block).getByText('1 failed')).toBeInTheDocument()
    await userEvent.click(within(block).getByRole('button', { name: 'Open Inbox' }))
    expect(onOpenWhatsApp).toHaveBeenCalled()
    await userEvent.click(within(block).getByRole('button', { name: 'Automations' }))
    expect(onOpenAutomations).toHaveBeenCalled()
  })
})
