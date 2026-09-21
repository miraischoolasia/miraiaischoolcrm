import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleModal } from './ScheduleModal'
import type { Schedule, ScheduleFormState } from '../../types/domain'

const regularSchedule: Schedule = {
  id: 1,
  teacherId: 1,
  classroomId: 1,
  title: 'Group A',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 2,
  scheduledDate: null,
  startTime: '19:30',
  endTime: '21:30',
  startRecur: '2026-09-01',
  endRecur: null,
  status: 'active',
  notes: null,
}

const formState: ScheduleFormState = {
  title: 'Group A',
  teacherId: '1',
  classroomId: '1',
  eventType: 'regular',
  dayOfWeek: '2',
  scheduledDate: '',
  startTime: '19:30',
  endTime: '21:30',
  startRecur: '2026-09-01',
  endRecur: '',
  notes: '',
  participantIds: [],
}

function renderModal(overrides: Partial<React.ComponentProps<typeof ScheduleModal>> = {}) {
  const props: React.ComponentProps<typeof ScheduleModal> = {
    isCreatingSchedule: false,
    editingSchedule: regularSchedule,
    formState,
    saveError: null,
    isSaving: false,
    activeVisibleClassrooms: [],
    scheduleLinkedClassroom: null,
    scheduleClassroomRoster: [],
    teacherMap: new Map(),
    assignableTeachers: [],
    students: [],
    todayString: '2026-09-21',
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onFieldChange: vi.fn(),
    onToggleParticipant: vi.fn(),
    onCancelSchedule: vi.fn(),
    occurrenceDate: '2026-09-08',
    isOccurrenceLogged: false,
    onCancelOccurrence: vi.fn(),
    ...overrides,
  }
  render(<ScheduleModal {...props} />)
  return props
}

describe('ScheduleModal single-day cancellation', () => {
  it('offers to cancel just the clicked day of a weekly class, passing the reason', async () => {
    const props = renderModal()

    expect(screen.getByText('Cancel only 2026-09-08')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Entire Schedule' })).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Reason/), 'Teacher on leave')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel This Day' }))

    expect(props.onCancelOccurrence).toHaveBeenCalledWith('Teacher on leave')
    expect(props.onCancelSchedule).not.toHaveBeenCalled()
  })

  it('keeps the whole-schedule cancel button working', async () => {
    const props = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel Entire Schedule' }))

    expect(props.onCancelSchedule).toHaveBeenCalledTimes(1)
    expect(props.onCancelOccurrence).not.toHaveBeenCalled()
  })

  it('blocks cancelling a day that already has attendance', () => {
    renderModal({ isOccurrenceLogged: true })

    expect(screen.queryByRole('button', { name: 'Cancel This Day' })).not.toBeInTheDocument()
    expect(screen.getByText(/Attendance was already submitted/)).toBeInTheDocument()
  })

  it('does not show the single-day option without a clicked day', () => {
    renderModal({ occurrenceDate: null })

    expect(screen.queryByRole('button', { name: 'Cancel This Day' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Schedule' })).toBeInTheDocument()
  })

  it('does not show the single-day option for a replacement class', () => {
    renderModal({
      editingSchedule: {
        ...regularSchedule,
        eventType: 'replacement',
        recurrenceType: 'none',
        classroomId: null,
        dayOfWeek: null,
        scheduledDate: '2026-09-08',
        startRecur: null,
      },
      formState: { ...formState, eventType: 'replacement', classroomId: '' },
    })

    expect(screen.queryByRole('button', { name: 'Cancel This Day' })).not.toBeInTheDocument()
  })

  it('does not show the single-day option while creating a schedule', () => {
    renderModal({ isCreatingSchedule: true, editingSchedule: null })

    expect(screen.queryByRole('button', { name: 'Cancel This Day' })).not.toBeInTheDocument()
  })
})
