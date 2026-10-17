import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentVideosTab } from './StudentVideosTab'
import type { Classroom } from '../types/domain'

const mocks = vi.hoisted(() => ({ data: vi.fn(), monthOn: vi.fn(), setAccess: vi.fn() }))
vi.mock('../lib/classVideos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchStudentVideoData: mocks.data,
  fetchMonthAccessOn: mocks.monthOn,
  setStudentVideoAccess: mocks.setAccess,
}))

const room = (id: number, name: string) => ({ id, name }) as Classroom

describe('StudentVideosTab', () => {
  beforeEach(() => {
    mocks.monthOn.mockReset().mockResolvedValue(true)
    mocks.setAccess.mockReset().mockResolvedValue(null)
    mocks.data.mockReset().mockResolvedValue({
      videos: [
        { id: 1, classroomId: 10, title: 'Loops 1', year: 2026, month: 9, lessonDate: null },
        { id: 2, classroomId: 10, title: 'Loops 2', year: 2026, month: 10, lessonDate: null },
        { id: 3, classroomId: 20, title: 'Cells', year: 2026, month: 10, lessonDate: null },
      ],
      access: [{ studentId: 5, classroomId: 10, year: 2026, month: 10, startsOn: null, endsOn: null }],
      progress: [{ studentId: 5, videoId: 2, percentage: 40, completed: false, rewatches: 0, lastWatchedAt: '2026-10-15T10:00:00Z' }],
    })
  })

  it('shows each class by month: open or closed, and how far the student watched', async () => {
    render(<StudentVideosTab studentId={5} classrooms={[room(10, 'MM Form 2'), room(20, 'SCI Form 2')]} canEdit />)
    const mm = (await screen.findByText('MM Form 2', { selector: 'h4' })).closest('section') as HTMLElement
    expect(within(mm).getByText('watched 1 of 2')).toBeInTheDocument()
    expect(within(mm).getByText('Open', { selector: 'span' })).toBeInTheDocument()
    expect(within(mm).getByText('Closed', { selector: 'span' })).toBeInTheDocument()

    await userEvent.click(within(mm).getByText('October 2026'))
    expect(within(mm).getByText('40%')).toBeInTheDocument()

    // Opening September for this student.
    const september = within(mm).getByText('September 2026').closest('li') as HTMLElement
    await userEvent.click(within(september).getByRole('button', { name: 'Open' }))
    expect(mocks.setAccess).toHaveBeenCalledWith(5, 10, 2026, 9, true, null, null)
  })

  it('only shows the records to a login that may not change them', async () => {
    render(<StudentVideosTab studentId={5} classrooms={[room(10, 'MM Form 2')]} canEdit={false} />)
    await screen.findByText('MM Form 2', { selector: 'h4' })
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })
})
