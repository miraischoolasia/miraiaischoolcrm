import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CalendarDayList } from './CalendarDayList'
import type { DayListLesson } from '../../lib/calendarDayList'

const lesson = (id: number, change: Partial<DayListLesson> = {}): DayListLesson => ({
  key: `${id}:2026-10-19`,
  scheduleId: id,
  teacherId: 1,
  date: '2026-10-19',
  title: `Class ${id}`,
  subtitle: '',
  classroomId: id,
  kind: 'regular',
  startTime: '15:45:00',
  endTime: '17:00:00',
  makeupMinutes: 0,
  isMakeupOnly: false,
  studentCount: 96,
  log: null,
  editableUntil: null,
  state: 'open',
  minutes: 75,
  teacherName: 'Ms Madeline',
  grade: 'Form 1',
  subject: 'MM',
  fbGroupUrl: null,
  zoomLink: null,
  ...change,
})

// Monday 19 Oct 2026, 2:22 pm.
const now = new Date(2026, 9, 19, 14, 22)

const lessons = [
  lesson(1, { title: 'MM Form 1' }),
  lesson(2, { title: 'SEJ Form 1', subject: 'SEJ', teacherId: 2, teacherName: 'Ms Jessie', studentCount: 400, startTime: '17:15:00', endTime: '18:30:00' }),
  lesson(3, { title: 'BMK Year 5', subject: 'BMK', grade: 'Year 5', teacherId: 3, teacherName: 'Ms Regina', studentCount: 34 }),
  lesson(4, { title: 'Morning class', startTime: '08:15:00', endTime: '09:30:00' }),
  lesson(5, { title: 'GEO Form 2', subject: 'GEO', grade: 'Form 2', date: '2026-10-20', key: '5:2026-10-20', state: 'later' }),
]

function renderList(change: Partial<React.ComponentProps<typeof CalendarDayList>> = {}) {
  const handlers = {
    onSelectDate: vi.fn(),
    onMonthChange: vi.fn(),
    onOpenLesson: vi.fn(),
    onTakeAttendance: vi.fn(),
    onRunLive: vi.fn(),
    onShowCalendar: vi.fn(),
  }
  render(
    <CalendarDayList
      today="2026-10-19"
      now={now}
      date="2026-10-19"
      monthKey="2026-10"
      lessons={lessons}
      grades={['Year 5', 'Form 1', 'Form 2']}
      {...handlers}
      {...change}
    />,
  )
  return handlers
}

describe('CalendarDayList', () => {
  it('lists the day by start time, with how many classes, places and how long until each time starts', () => {
    renderList()
    expect(screen.getByRole('heading', { name: 'Mon, 19 Oct' })).toBeInTheDocument()
    expect(screen.getByText('4 classes')).toBeInTheDocument()

    const quarterTo4 = screen.getByRole('region', { name: '3:45 pm classes' })
    expect(within(quarterTo4).getByText(/2 classes · 130 on the lists/)).toBeInTheDocument()
    expect(within(quarterTo4).getByText('in 1 h 23 min')).toBeInTheDocument()
    // The school's grade order: Year 5 before Form 1.
    expect(within(quarterTo4).getAllByRole('button', { name: /students$/ }).map((card) => card.textContent)).toEqual([
      expect.stringContaining('BMK Year 5'),
      expect.stringContaining('MM Form 1'),
    ])
  })

  it('names no students on a card, only how many', () => {
    renderList()
    const card = screen.getByRole('button', { name: 'SEJ Form 1, Ms Jessie, 400 students' })
    expect(card).toHaveTextContent('400')
  })

  it('folds a time that is over today, and shows it again on request', async () => {
    renderList()
    const morning = screen.getByRole('region', { name: '8:15 am classes' })
    expect(within(morning).queryByText('Morning class')).not.toBeInTheDocument()

    await userEvent.click(within(morning).getByRole('button', { name: /Ended/ }))
    expect(within(morning).getByText('Morning class')).toBeInTheDocument()
  })

  it('opens a class, takes attendance and runs Live from its card', async () => {
    const { onOpenLesson, onTakeAttendance, onRunLive } = renderList()
    await userEvent.click(screen.getByRole('button', { name: 'MM Form 1, Ms Madeline, 96 students' }))
    expect(onOpenLesson).toHaveBeenCalledWith(expect.objectContaining({ title: 'MM Form 1' }))

    const card = screen.getByRole('button', { name: 'MM Form 1, Ms Madeline, 96 students' }).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: 'Attendance' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Live' }))
    expect(onTakeAttendance).toHaveBeenCalledTimes(1)
    expect(onRunLive).toHaveBeenCalledTimes(1)
  })

  it('narrows the day and the month counts by grade and subject', async () => {
    renderList()
    const filters = screen.getAllByRole('region', { name: 'Filters' })[0]
    await userEvent.click(within(filters).getByRole('button', { name: 'Y5' }))
    expect(screen.getByText('1 class')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mon, 19 Oct: 1 class' })[0]).toBeInTheDocument()

    await userEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }))
    await userEvent.click(within(filters).getByRole('button', { name: 'SEJ' }))
    expect(screen.getByText('1 class')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SEJ Form 1, Ms Jessie, 400 students' })).toBeInTheDocument()
  })

  it("lists the day's tasks, meetings, events and follow-ups first, counted on the small month, and opens one", async () => {
    const onOpenItem = vi.fn()
    renderList({
      items: [
        { id: 7, kind: 'follow_up', title: 'Follow up Mei Ling', date: '2026-10-19', startTime: '10:00', endTime: null, assigneeName: 'Ms Tina', isDone: false },
        { id: 8, kind: 'event', title: 'Deepavali', date: '2026-10-19', startTime: null, endTime: null, assigneeName: null, isDone: false },
      ],
      onOpenItem,
    })
    const todo = screen.getByRole('region', { name: 'To do and events' })
    expect(within(todo).getAllByRole('button').map((row) => row.textContent)).toEqual([
      expect.stringContaining('All dayEventDeepavali'),
      expect.stringContaining('10:00 amFollow-upFollow up Mei Ling'),
    ])
    expect(screen.getByText('+ 2 to do & events')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Mon, 19 Oct: 4 classes, 2 other' })[0]).toBeInTheDocument()

    await userEvent.click(within(todo).getByRole('button', { name: /Follow up Mei Ling/ }))
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
  })

  it('picks a day from the small month and switches to the month, week or agenda calendar', async () => {
    const { onSelectDate, onShowCalendar } = renderList()
    await userEvent.click(screen.getAllByRole('button', { name: 'Tue, 20 Oct: 1 class' })[0])
    expect(onSelectDate).toHaveBeenCalledWith('2026-10-20')

    await userEvent.click(within(screen.getByRole('group', { name: 'Calendar view' })).getByRole('button', { name: 'Month' }))
    expect(onShowCalendar).toHaveBeenCalledWith('dayGridMonth')
  })

  it('offers no attendance for a day still to come', () => {
    renderList({ date: '2026-10-20' })
    const card = screen.getByRole('button', { name: 'GEO Form 2, Ms Madeline, 96 students' }).closest('li')!
    expect(within(card).queryByRole('button', { name: 'Attendance' })).not.toBeInTheDocument()
  })
})
