import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassVideo } from '../../lib/classVideos'
import type { Classroom } from '../../types/domain'

const videos: ClassVideo[] = []
vi.mock('../../lib/classVideos', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/classVideos')>()),
  fetchAllClassVideos: vi.fn(async () => videos),
  fetchVideosPerMonth: vi.fn(async () => 4),
  fetchMonthAccessOn: vi.fn(async () => false),
  fetchVideoAccess: vi.fn(async () => []),
  fetchCanManageVideos: vi.fn(async () => true),
  fetchVideoProgress: vi.fn(async () => []),
}))
const grantMocks = vi.hoisted(() => ({ canGrant: vi.fn(async () => false), topicGrants: vi.fn(async () => []), setGrants: vi.fn(async () => null) }))
vi.mock('../../lib/videoGrants', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/videoGrants')>()),
  fetchTopicGrants: grantMocks.topicGrants,
  fetchCanGrantVideos: grantMocks.canGrant,
  setVideoGrants: grantMocks.setGrants,
}))
vi.mock('../../domain/studentStatus', async (importActual) => ({
  ...(await importActual<typeof import('../../domain/studentStatus')>()),
  getTodayString: () => '2026-10-18',
}))

const { ClassVideosSection, classVideoTeachers, monthCountTone } = await import('./ClassVideosSection')

const room = (id: number, name: string, ageGroup: string, subjectId: number, teacherIds: number[]): Classroom => ({
  id, name, category: 'regular', ageGroup, programLevel: '常规班', teacherId: teacherIds[0] ?? null, teacherIds, subjectId,
  status: 'active', notes: null, archivedAt: null,
})
const video = (id: number, classroomId: number, teacherId: number | null, year: number, month: number, extra: Partial<ClassVideo> = {}): ClassVideo => ({
  id, classroomId, teacherId, title: `Lesson ${id}`, description: null, year, month, lessonDate: null, libraryId: '1', videoId: `v${id}`,
  status: 'ready', source: 'import', views: 0, isArchived: false, createdAt: `2026-01-01T00:00:0${id % 10}Z`, ...extra,
})

describe('Class videos by grade, subject, teacher and month', () => {
  beforeEach(() => {
    videos.splice(0, videos.length,
      video(1, 10, 7, 2026, 10),
      video(2, 10, 7, 2026, 10),
      video(3, 10, 7, 2026, 9, { isArchived: true }),
      video(4, 10, 8, 2026, 10),
      video(5, 11, 7, 2025, 3),
    )
  })

  it('opens grade, subject and teacher in place and shows uploaded/expected beside each month', async () => {
    render(
      <ClassVideosSection
        classrooms={[room(10, 'F4 Maths', 'Form 4', 1, [7]), room(11, 'F5 Maths', 'Form 5', 1, [7])]}
        students={[]}
        subjects={[{ id: 1, name: 'Maths', sortOrder: 1, isActive: true }]}
        teacherNames={new Map([[7, 'Mr Tan'], [8, 'Ms Lee']])}
        currentTeacherId={7}
      />,
    )
    const form4 = await screen.findByRole('button', { name: /Form 4/ })
    await userEvent.click(form4)
    expect(form4).toHaveAttribute('aria-expanded', 'true')
    // The other grade stays in the list, closed.
    expect(screen.getByRole('button', { name: /Form 5/ })).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(screen.getByRole('button', { name: /Maths/ }))
    // The class's teacher, then someone else whose videos are there.
    expect(screen.getByRole('button', { name: /Ms Lee/ })).toHaveTextContent('Oct 1/4')
    await userEvent.click(screen.getByRole('button', { name: /Mr Tan/ }))
    expect(screen.getByRole('button', { name: 'Oct 2026: 2 of 4 videos' })).toHaveAttribute('aria-pressed', 'true')
    // A hidden video does not count, but its month stays listed so it can be shown again.
    expect(screen.getByRole('button', { name: 'Sep 2026: 0 of 4 videos' })).toBeInTheDocument()
    // Months with no videos are not listed.
    expect(screen.queryByRole('button', { name: /^Jan 2026/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Nov 2026/ })).not.toBeInTheDocument()
    expect(screen.getByText('Lesson 1')).toBeInTheDocument()
    expect(screen.queryByText('Lesson 4')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sep 2026: 0 of 4 videos' }))
    expect(screen.getByText('No videos for this month yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/Show hidden/))
    expect(screen.getByText('Lesson 3')).toBeInTheDocument()
    // Closing the grade folds everything under it.
    await userEvent.click(form4)
    expect(screen.queryByRole('button', { name: /Maths/ })).not.toBeInTheDocument()
  })

  it('shows no months for a teacher with no videos, just a way to upload', async () => {
    render(
      <ClassVideosSection
        classrooms={[room(12, 'F1 Science', 'Form 1', 1, [8])]}
        students={[]}
        subjects={[{ id: 1, name: 'Science', sortOrder: 1, isActive: true }]}
        teacherNames={new Map([[8, 'Ms Lee']])}
        currentTeacherId={8}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: /Form 1/ }))
    await userEvent.click(screen.getByRole('button', { name: /Science/ }))
    await userEvent.click(screen.getByRole('button', { name: /Ms Lee/ }))
    expect(screen.getByText('No videos yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /of 4 videos/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Upload video' })).toBeInTheDocument()
  })

  it('colours a month by how many of its videos are up', () => {
    expect(monthCountTone(4, 4)).toContain('emerald')
    expect(monthCountTone(2, 4)).toContain('amber')
    expect(monthCountTone(0, 4)).toContain('slate')
  })

  it('lists a class with no teacher and no videos once, as No teacher', () => {
    expect(classVideoTeachers(room(12, 'X', 'Form 1', 1, []), [])).toEqual([null])
    expect(classVideoTeachers(room(10, 'X', 'Form 1', 1, [7]), [video(9, 10, null, 2026, 1)])).toEqual([7, null])
  })
})
