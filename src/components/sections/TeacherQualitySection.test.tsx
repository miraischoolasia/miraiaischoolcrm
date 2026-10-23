import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QualityLesson, QualityPeriod } from '../../lib/classQuality'

const api = vi.hoisted(() => ({
  lessons: [] as QualityLesson[],
  periods: [] as QualityPeriod[],
  save: vi.fn(),
}))

vi.mock('../../lib/classQuality', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/classQuality')>()
  return {
    ...real,
    fetchQualityLessons: vi.fn(async () => api.lessons),
    fetchQualityPeriods: vi.fn(async () => api.periods),
    fetchRosterCounts: vi.fn(async () => ({ countCategories: [], changesFrom: null })),
    fetchQualitySettings: vi.fn(async () => real.DEFAULT_QUALITY_SETTINGS),
    saveQualitySettings: api.save,
  }
})

import { TeacherQualitySection } from './TeacherQualitySection'
import { DEFAULT_QUALITY_SETTINGS } from '../../lib/classQuality'

const lesson = (extra: Partial<QualityLesson>): QualityLesson => ({
  sessionId: 1,
  lessonDate: '2026-10-20',
  status: 'ended',
  startsAt: '2026-10-20T11:00:00Z',
  endsAt: '2026-10-20T12:15:00Z',
  classroomId: 1,
  classroomName: 'F1 Math',
  teacherId: 2,
  substitute: false,
  hasZoom: true,
  marked: 10,
  attended: 9,
  participationSum: 85,
  participationCount: 1,
  correct: 3,
  wrong: 7,
  questions: 2,
  teacherJoinedAt: null,
  startedOnTime: true,
  recordingOnTime: true,
  recordingAt: null,
  attendanceSentAt: null,
  attendanceOnTime: true,
  presentLogged: 9,
  commented: 9,
  ...extra,
})

const teachers = [
  { id: 2, fullName: 'Teacher Lina' },
  { id: 3, fullName: 'Teacher Omar' },
]

describe('Teacher quality', () => {
  beforeEach(() => {
    api.lessons = [
      lesson({ sessionId: 1 }),
      lesson({ sessionId: 9, lessonDate: '2026-09-21', correct: 1, wrong: 9 }),
    ]
    api.periods = [
      { periodId: 1, studentId: 1, studentName: 'Aiden', studentCode: null, classroomId: 1, classroomName: 'F1 Math', teacherId: 2, startDate: '2026-08-01', endDate: '2026-10-15' },
      { periodId: 2, studentId: 2, studentName: 'Bella', studentCode: null, classroomId: 1, classroomName: 'F1 Math', teacherId: 2, startDate: '2026-08-01', endDate: null },
    ]
    api.save.mockReset()
  })

  it('shows each teacher’s month, red below the line and the change from last month', async () => {
    render(<TeacherQualitySection teachers={teachers} canEdit today="2026-10-23" />)
    const row = (await screen.findByRole('button', { name: 'Teacher Lina' })).closest('tr') as HTMLElement
    // Answers right 30% is below the 50% line, and up 20 from September's 10%.
    const right = within(row).getByText(/^30%/)
    expect(right.closest('span.bg-red-50')).not.toBeNull()
    expect(within(row).getByText('▲20', { exact: false })).toBeInTheDocument()
    expect(within(row).getByText('9/10')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Teacher Lina' }))
    expect(screen.getByText('2026-10-20')).toBeInTheDocument()
  })

  it('shows retention, and who stopped when a month is opened', async () => {
    render(<TeacherQualitySection teachers={teachers} canEdit today="2026-10-23" />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Retention' }))
    const cell = await screen.findByRole('button', { name: /50%/ })
    await userEvent.click(cell)
    expect(screen.getByText(/Aiden — F1 Math \(2026-10-15\)/)).toBeInTheDocument()
  })

  it('saves only the settings that changed', async () => {
    api.save.mockResolvedValue({ ...DEFAULT_QUALITY_SETTINGS, low_score_percent: 40 })
    render(<TeacherQualitySection teachers={teachers} canEdit today="2026-10-23" />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Alert settings' }))
    const percent = screen.getAllByRole('spinbutton', { name: 'Percent' })[0]
    await userEvent.clear(percent)
    await userEvent.type(percent, '40')
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(api.save).toHaveBeenCalledWith({ low_score_percent: 40 })
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument()
  })

  it('without the edit tick the settings are read only', async () => {
    render(<TeacherQualitySection teachers={teachers} canEdit={false} today="2026-10-23" />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Alert settings' }))
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('spinbutton', { name: 'Percent' })[0]).toBeDisabled()
  })
})
