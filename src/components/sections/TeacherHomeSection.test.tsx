import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TeacherHomeSection, type TeacherHomeClass } from './TeacherHomeSection'
import type { AgendaItem, TeacherAgenda } from '../../lib/teacherAgenda'

const today = '2026-10-09'
// Friday 3:10 pm.
const now = new Date(2026, 9, 9, 15, 10)

function item(overrides: Partial<AgendaItem>): AgendaItem {
  return {
    key: 'k', scheduleId: 1, date: today, title: 'FRI C006', subtitle: '9-11 Years Old · Coder Pro', classroomId: 6, kind: 'regular',
    startTime: '16:00', endTime: '17:30', makeupMinutes: 0, isMakeupOnly: false, studentCount: 5, log: null, editableUntil: null,
    state: 'open', minutes: 90, ...overrides,
  }
}

const emptyAgenda: TeacherAgenda = { today: [], todo: [], upcoming: [], week: { classes: 0, hours: 0 } }

function renderHome(agenda: Partial<TeacherAgenda> = {}, props: Partial<React.ComponentProps<typeof TeacherHomeSection>> = {}) {
  const handlers = { onTakeAttendance: vi.fn(), onOpenCalendar: vi.fn(), onOpenClass: vi.fn() }
  render(
    <TeacherHomeSection
      teacherName="Ms Rachel"
      todayString={today}
      agenda={{ ...emptyAgenda, ...agenda }}
      classes={[]}
      now={now}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('TeacherHomeSection', () => {
  it('greets the teacher and counts today, the to-do and the week', () => {
    renderHome({
      today: [item({ key: 'a' })],
      todo: [item({ key: 'b', date: '2026-10-07', state: 'missing' })],
      week: { classes: 6, hours: 9 },
    })

    expect(screen.getByRole('heading', { name: 'Good afternoon, Ms Rachel' })).toBeInTheDocument()
    expect(screen.getByText('Friday, Oct 9 · 3:10 pm')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('classes · 9 h')).toBeInTheDocument()
  })

  it('puts a missed attendance under To do and opens it', async () => {
    const missed = item({ key: 'b', title: 'WED C002', date: '2026-10-07', state: 'missing', studentCount: 5 })
    const { onTakeAttendance } = renderHome({ todo: [missed] })

    const todo = screen.getByRole('region', { name: 'To do' })
    expect(within(todo).getByText('WED C002 · Wed, Oct 7 · 4:00 pm-5:30 pm')).toBeInTheDocument()
    expect(within(todo).getByText('5 students · attendance not submitted')).toBeInTheDocument()
    await userEvent.click(within(todo).getByRole('button', { name: 'Take attendance' }))
    expect(onTakeAttendance).toHaveBeenCalledWith(missed)
  })

  it('shows the first five missed classes and the rest on request', async () => {
    const todo = Array.from({ length: 7 }, (_, index) =>
      item({ key: `m${index}`, title: `CLASS ${index + 1}`, date: `2026-10-0${index + 1}`, state: 'missing' }),
    )
    renderHome({ todo })
    const section = screen.getByRole('region', { name: 'To do' })

    expect(within(section).getAllByRole('listitem')).toHaveLength(5)
    await userEvent.click(within(section).getByRole('button', { name: 'Show all 7' }))
    expect(within(section).getAllByRole('listitem')).toHaveLength(7)
    await userEvent.click(within(section).getByRole('button', { name: 'Show fewer' }))
    expect(within(section).getAllByRole('listitem')).toHaveLength(5)
  })

  it('tells the teacher what to do about a class that never ran', () => {
    renderHome({ todo: [item({ state: 'missing', date: '2026-10-07' })] })

    expect(screen.getByText(/Ask the\s+admin to cancel that day/)).toBeInTheDocument()
  })

  it('has no To do list when nothing is missing', () => {
    renderHome({ today: [item({})] })

    expect(screen.queryByRole('region', { name: 'To do' })).not.toBeInTheDocument()
    expect(screen.getByText('attendance missing').closest('div')?.parentElement).not.toHaveClass('bg-amber-50')
  })

  it("shows today's classes with where each one is", () => {
    renderHome({
      today: [
        item({ key: 'done', title: 'HOA slot', kind: 'trial', subtitle: 'Trial class', startTime: '10:00', endTime: '11:30', state: 'submitted', studentCount: 2, editableUntil: now.getTime() + 21 * 3600000 }),
        item({ key: 'next', title: 'FRI C006' }),
        item({ key: 'later', title: 'FRI C008', startTime: '18:00', endTime: '19:30', studentCount: 4 }),
      ],
    })
    const today = screen.getByRole('region', { name: 'Today' })
    const rows = within(today).getAllByRole('listitem')

    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('10:00 am')
    expect(rows[0]).toHaveTextContent('✓ Submitted')
    expect(rows[0]).toHaveTextContent('editable for 21 h')
    expect(within(rows[0]).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('4:00 pm')
    expect(rows[1]).toHaveTextContent('in 50 min')
    expect(rows[1]).toHaveTextContent('Later today')
    expect(rows[2]).toHaveTextContent('in 2 h 50 min')
  })

  it('says Attendance not taken once the class has started, and highlights the button', () => {
    renderHome({ today: [item({ startTime: '15:00', endTime: '16:30' })] })

    const row = screen.getByRole('region', { name: 'Today' }).querySelector('li') as HTMLElement
    expect(row).toHaveTextContent('Attendance not taken')
    expect(within(row).getByRole('button', { name: 'Take attendance' })).toHaveClass('bg-[#fc0c97]')
  })

  it('locks a submitted class after 24 hours unless late editing is on', () => {
    const locked = item({ state: 'submitted', log: {} as AgendaItem['log'], editableUntil: now.getTime() - 1000 })
    const { onTakeAttendance } = renderHome({ today: [locked] })
    const row = screen.getByRole('region', { name: 'Today' }).querySelector('li') as HTMLElement

    expect(row).toHaveTextContent('locked')
    expect(within(row).getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(onTakeAttendance).not.toHaveBeenCalled()
  })

  it('stays editable when late editing is on', () => {
    renderHome({ today: [item({ state: 'submitted', editableUntil: now.getTime() - 1000 })] }, { lateEditOpen: true })
    const row = screen.getByRole('region', { name: 'Today' }).querySelector('li') as HTMLElement

    expect(row).toHaveTextContent('late editing is on')
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('says so when there is no class today, and names the next one', () => {
    renderHome({ upcoming: [item({ key: 'n', date: '2026-10-10', state: 'later' })] })

    expect(screen.getByText('No classes today. Next class: Sat, Oct 10.')).toBeInTheDocument()
  })

  it('lists what is coming with make-up minutes, and opens a roster', async () => {
    const coming = item({ key: 'c', date: '2026-10-14', title: 'WED C002', state: 'later', makeupMinutes: 30, endTime: '18:00' })
    const { onTakeAttendance } = renderHome({ upcoming: [coming] })
    const section = screen.getByRole('region', { name: 'Coming up' })

    expect(within(section).getByText('Wed, Oct 14')).toBeInTheDocument()
    expect(within(section).getByText('Make-up +30 min')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: 'Roster' }))
    expect(onTakeAttendance).toHaveBeenCalledWith(coming)
  })

  it('shows the teacher their own classes and opens one', async () => {
    const classes: TeacherHomeClass[] = [
      { id: 5, name: 'WED C002', subtitle: '9-11 Years Old · Coder Pro', studentCount: 5, slots: ['Wed 4:00 pm-5:30 pm'], missing: 1 },
      { id: 6, name: 'FRI C006', subtitle: '9-11 Years Old · Coder Pro', studentCount: 1, slots: [], missing: 0 },
    ]
    const { onOpenClass, onOpenCalendar } = renderHome({}, { classes })
    const section = screen.getByRole('region', { name: 'My classes' })

    expect(within(section).getByText('1 not submitted')).toBeInTheDocument()
    expect(within(section).getByText('1 student')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: 'Open class WED C002' }))
    expect(onOpenClass).toHaveBeenCalledWith(5)

    await userEvent.click(screen.getByRole('button', { name: 'Open full calendar' }))
    expect(onOpenCalendar).toHaveBeenCalledTimes(1)
  })
})
