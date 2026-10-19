import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LessonWindow } from './LessonWindow'
import type { DayListLesson } from '../../lib/calendarDayList'

const lesson = (change: Partial<DayListLesson> = {}): DayListLesson => ({
  key: '7:2026-10-19',
  scheduleId: 7,
  teacherId: 26,
  date: '2026-10-19',
  title: 'SCI Form 2',
  subtitle: '',
  classroomId: 30,
  kind: 'regular',
  startTime: '17:15:00',
  endTime: '18:30:00',
  makeupMinutes: 0,
  isMakeupOnly: false,
  studentCount: 280,
  log: null,
  editableUntil: null,
  state: 'open',
  minutes: 75,
  teacherName: 'Ms Angeline',
  grade: 'Form 2',
  subject: 'SCI',
  fbGroupUrl: 'https://www.facebook.com/groups/1',
  zoomLink: 'https://us06web.zoom.us/j/1',
  ...change,
})

const now = new Date(2026, 9, 19, 14, 22)

function renderWindow(change: Partial<React.ComponentProps<typeof LessonWindow>> = {}) {
  const handlers = {
    rosterNames: vi.fn(() => ['Aisyah', 'Ben']),
    onTakeAttendance: vi.fn(),
    onRunLive: vi.fn(),
    onEdit: vi.fn(),
    onClose: vi.fn(),
  }
  render(<LessonWindow lesson={lesson()} today="2026-10-19" now={now} alongside={[]} {...handlers} {...change} />)
  return handlers
}

describe('LessonWindow', () => {
  it('shows the class, its teacher and how many children, with the names only on request', async () => {
    const { rosterNames } = renderWindow()
    expect(screen.getByRole('heading', { name: 'SCI Form 2' })).toBeInTheDocument()
    expect(screen.getByText('Ms Angeline')).toBeInTheDocument()
    expect(screen.getByText('280 on the list')).toBeInTheDocument()
    expect(screen.getByText('in 2 h 53 min')).toBeInTheDocument()
    expect(rosterNames).not.toHaveBeenCalled()
    expect(screen.queryByText('Aisyah')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Class list/ }))
    expect(rosterNames).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('list', { name: 'Class list' })).toHaveTextContent('AisyahBen')
  })

  it('takes attendance, runs Live class and opens the schedule window', async () => {
    const { onTakeAttendance, onRunLive, onEdit } = renderWindow()
    await userEvent.click(screen.getByRole('button', { name: 'Take attendance (280)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Live class' }))
    await userEvent.click(screen.getByRole('button', { name: /Change teacher, move or cancel/ }))
    expect(onTakeAttendance).toHaveBeenCalledTimes(1)
    expect(onRunLive).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('links the lesson\'s own Zoom and Facebook group, and says when there is none', () => {
    renderWindow()
    expect(screen.getByRole('link', { name: 'Open Zoom' })).toHaveAttribute('href', 'https://us06web.zoom.us/j/1')
    expect(screen.getByRole('link', { name: 'Open group' })).toHaveAttribute('href', 'https://www.facebook.com/groups/1')
  })

  it('names the other teacher in the same class at the same time', () => {
    renderWindow({ alongside: [lesson({ key: '8:2026-10-19', teacherName: 'Ms Joey', subject: 'SCI' })] })
    expect(screen.getByText(/Same class at the same time: SCI · Ms Joey/)).toBeInTheDocument()
  })

  it('has no attendance for a day still to come, no schedule window for a teacher, and closes on Escape', async () => {
    const { onClose } = renderWindow({ lesson: lesson({ state: 'later', date: '2026-10-20', zoomLink: null, fbGroupUrl: null }), onEdit: undefined })
    expect(screen.queryByRole('button', { name: /Take attendance/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Change teacher/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('No link')).toHaveLength(2)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
