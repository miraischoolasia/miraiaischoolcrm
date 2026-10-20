import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Classroom, Student } from '../../types/domain'

const mocks = vi.hoisted(() => ({ setGrants: vi.fn() }))
vi.mock('../../lib/videoGrants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setVideoGrants: mocks.setGrants,
}))
vi.mock('../../domain/studentStatus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTodayString: () => '2026-10-20',
}))

const { BulkVideoGrantsModal } = await import('./BulkVideoGrantsModal')

const room = (id: number, name: string, ageGroup: string, subjectId: number | null): Classroom =>
  ({ id, name, ageGroup, subjectId, status: 'active', category: 'regular' }) as Classroom
const kid = (id: number, name: string, classroomId: number): Student =>
  ({ id, name, isActive: true, classroomId, classPeriods: [{ classroomId, startDate: null, endDate: null }] }) as unknown as Student

const classrooms = [room(1, 'SCI Year 5 · Ms Joey', 'Year 5', 13), room(2, 'SCI Year 5 · Ms Tiffany', 'Year 5', 13), room(3, 'Robotics', 'Year 5', null)]
const students = [kid(11, 'Ali', 1), kid(12, 'Siti', 1), kid(13, 'Mei', 2)]
const subjects = [{ id: 13, name: 'SCI', sortOrder: 10, isActive: true }]

function open() {
  const onDone = vi.fn()
  render(
    <BulkVideoGrantsModal classrooms={classrooms} students={students} subjects={subjects} ageGroups={['Year 4', 'Year 5', 'Year 6']} onClose={vi.fn()} onDone={onDone} />,
  )
  return onDone
}

describe('Opening months for many students', () => {
  beforeEach(() => {
    mocks.setGrants.mockReset().mockResolvedValue(null)
  })

  it("opens a class's own topic for all its students at once", async () => {
    const onDone = open()
    await userEvent.selectOptions(screen.getByLabelText('Students from a class'), '1')
    expect(screen.getByText('2 of 2 ticked')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Nov 2026'))
    await userEvent.click(screen.getByRole('button', { name: 'Open for 2 students' }))
    expect(mocks.setGrants).toHaveBeenCalledWith({
      studentIds: [11, 12],
      topic: { kind: 'topic', ageGroup: 'Year 5', subjectId: 13 },
      months: [{ year: 2026, month: 10 }, { year: 2026, month: 11 }],
      granted: true,
      startsOn: null,
      endsOn: null,
    })
    expect(onDone).toHaveBeenCalled()
  })

  it('opens another age group for a whole age group, leaving out an unticked child', async () => {
    open()
    await userEvent.selectOptions(screen.getByLabelText('Students from an age group'), 'Year 5')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mei' }))
    await userEvent.selectOptions(screen.getByLabelText('Recordings of age group'), 'Year 6')
    await userEvent.selectOptions(screen.getByLabelText('Recordings of subject'), '13')
    await userEvent.click(screen.getByRole('button', { name: 'Open for 2 students' }))
    expect(mocks.setGrants).toHaveBeenCalledWith(
      expect.objectContaining({ studentIds: [11, 12], topic: { kind: 'topic', ageGroup: 'Year 6', subjectId: 13 } }),
    )
  })

  it('opens a class with no subject as itself', async () => {
    open()
    await userEvent.selectOptions(screen.getByLabelText('Students from a class'), '1')
    await userEvent.selectOptions(screen.getByLabelText('Recordings of subject'), 'c:3')
    await userEvent.click(screen.getByRole('button', { name: 'Open for 2 students' }))
    expect(mocks.setGrants).toHaveBeenCalledWith(expect.objectContaining({ topic: { kind: 'class', classroomId: 3 } }))
  })
})
