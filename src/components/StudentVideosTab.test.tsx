import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentVideosTab } from './StudentVideosTab'
import type { Classroom } from '../types/domain'

const mocks = vi.hoisted(() => ({
  data: vi.fn(),
  monthOn: vi.fn(),
  grants: vi.fn(),
  canGrant: vi.fn(),
  setGrants: vi.fn(),
}))
vi.mock('../lib/classVideos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchStudentVideoData: mocks.data,
  fetchMonthAccessOn: mocks.monthOn,
}))
vi.mock('../lib/videoGrants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchStudentGrants: mocks.grants,
  fetchCanGrantVideos: mocks.canGrant,
  setVideoGrants: mocks.setGrants,
}))
vi.mock('../lib/subjects', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSubjects: vi.fn(async () => [
    { id: 1, name: 'MM', sortOrder: 10, isActive: true },
    { id: 13, name: 'SCI', sortOrder: 20, isActive: true },
  ]),
}))
// The tests never read the real database.
vi.mock('../lib/supabase', () => ({ supabase: null }))
vi.mock('../domain/studentStatus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTodayString: () => '2026-10-20',
}))

const room = (id: number, name: string, ageGroup: string, subjectId: number) => ({ id, name, ageGroup, subjectId }) as Classroom

describe('StudentVideosTab', () => {
  beforeEach(() => {
    mocks.monthOn.mockReset().mockResolvedValue(true)
    mocks.canGrant.mockReset().mockResolvedValue(true)
    mocks.setGrants.mockReset().mockResolvedValue(null)
    mocks.grants.mockReset().mockResolvedValue([
      // October of MM Form 2 is open; September of an older age group was ticked by staff.
      { id: 1, studentId: 5, year: 2026, month: 10, startsOn: null, endsOn: null, topic: { kind: 'topic', ageGroup: 'Form 2', subjectId: 1 } },
      { id: 2, studentId: 5, year: 2026, month: 9, startsOn: null, endsOn: null, topic: { kind: 'topic', ageGroup: 'Form 3', subjectId: 13 } },
      // SCI Form 2 August ended when the student stopped.
      { id: 3, studentId: 5, year: 2026, month: 8, startsOn: null, endsOn: '2026-09-30', topic: { kind: 'topic', ageGroup: 'Form 2', subjectId: 13 } },
    ])
    mocks.data.mockReset().mockResolvedValue({
      videos: [
        { id: 1, classroomId: 10, title: 'Loops 1', year: 2026, month: 9, lessonDate: null },
        { id: 2, classroomId: 10, title: 'Loops 2', year: 2026, month: 10, lessonDate: null },
        { id: 3, classroomId: 20, title: 'Cells', year: 2026, month: 10, lessonDate: null },
      ],
      access: [],
      progress: [{ studentId: 5, videoId: 2, percentage: 40, completed: false, rewatches: 0, lastWatchedAt: '2026-10-15T10:00:00Z' }],
    })
  })

  it('ticks age group x subject x month, including another age group', async () => {
    render(<StudentVideosTab studentId={5} classrooms={[room(10, 'MM Form 2', 'Form 2', 1), room(20, 'SCI Form 2', 'Form 2', 13)]} />)
    const grid = await screen.findByRole('region', { name: 'Recordings access' })
    expect(await within(grid).findByRole('checkbox', { name: 'MM · Form 2 Oct 2026' })).toBeChecked()
    expect(within(grid).getByRole('checkbox', { name: 'MM · Form 2 Sep 2026' })).not.toBeChecked()
    expect(within(grid).getByRole('checkbox', { name: 'SCI · Form 3 Sep 2026' })).toBeChecked()
    // Closed by a stop: unticked, with its end day.
    expect(within(grid).getByRole('checkbox', { name: 'SCI · Form 2 Aug 2026' })).not.toBeChecked()

    await userEvent.click(within(grid).getByRole('checkbox', { name: 'MM · Form 2 Sep 2026' }))
    expect(mocks.setGrants).toHaveBeenCalledWith({
      studentIds: [5],
      topic: { kind: 'topic', ageGroup: 'Form 2', subjectId: 1 },
      months: [{ year: 2026, month: 9 }],
      granted: true,
    })

    // Watch progress per class is still there.
    const mm = screen.getByText('MM Form 2', { selector: 'h4' }).closest('section') as HTMLElement
    expect(within(mm).getByText('watched 1 of 2')).toBeInTheDocument()
    await userEvent.click(within(mm).getByText('October 2026'))
    expect(within(mm).getByText('40%')).toBeInTheDocument()
  })

  it('only shows the access to a login that may not open recordings', async () => {
    mocks.canGrant.mockResolvedValue(false)
    render(<StudentVideosTab studentId={5} classrooms={[room(10, 'MM Form 2', 'Form 2', 1)]} />)
    const grid = await screen.findByRole('region', { name: 'Recordings access' })
    expect(await within(grid).findByRole('checkbox', { name: 'MM · Form 2 Oct 2026' })).toBeDisabled()
    expect(within(grid).queryByRole('button', { name: /All of/ })).not.toBeInTheDocument()
  })

  it('has no grid when the school does not use month access', async () => {
    mocks.monthOn.mockResolvedValue(false)
    render(<StudentVideosTab studentId={5} classrooms={[room(10, 'MM Form 2', 'Form 2', 1)]} />)
    await screen.findByText('MM Form 2', { selector: 'h4' })
    expect(screen.queryByRole('region', { name: 'Recordings access' })).not.toBeInTheDocument()
  })
})
