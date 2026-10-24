import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LessonSeatModal } from './LessonSeatModal'
import type { Lesson, TargetLesson } from '../../lib/lessonSeats'
import type { LessonSeat } from '../../types/domain'

const lesson = (classroomId: number, className: string, date: string, startTime: string): Lesson => ({
  scheduleId: classroomId,
  classroomId,
  className,
  ageGroup: '6-8 Years Old',
  date,
  startTime,
  endTime: '11:00',
  teacherId: 1,
})

const own = lesson(1, 'Mon A', '2026-11-02', '10:00')
const missed = lesson(1, 'Mon A', '2026-10-26', '10:00')
const target: TargetLesson = { ...lesson(2, 'Tue B', '2026-11-03', '12:00'), children: 3, sameAgeGroup: true }
const otherTarget: TargetLesson = { ...lesson(3, 'Tue C', '2026-11-03', '09:00'), children: 1, sameAgeGroup: false }

function setup(extra: Partial<React.ComponentProps<typeof LessonSeatModal>> = {}) {
  const onBook = vi.fn().mockResolvedValue(null)
  const onUndo = vi.fn().mockResolvedValue(null)
  render(
    <LessonSeatModal
      studentName="Mia Tan"
      upcoming={[own]}
      past={[{ lesson: missed, statusLabel: 'Absent' }]}
      targets={[target, otherTarget]}
      seats={[]}
      classNameOf={(id) => `Class ${id}`}
      teacherNameOf={() => 'Teacher Lina'}
      canEdit
      onBook={onBook}
      onUndo={onUndo}
      onClose={vi.fn()}
      {...extra}
    />,
  )
  return { onBook, onUndo }
}

describe('LessonSeatModal', () => {
  it('books a change class: pick the lesson, pick the new one, book', async () => {
    const { onBook } = setup()

    expect(screen.getByRole('button', { name: 'Change class' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Their lesson'), screen.getByRole('option', { name: /Mon A/ }))
    const list = screen.getByRole('radiogroup', { name: 'Lesson to sit in' })
    expect(within(list).getByText('Same age group')).toBeInTheDocument()
    await userEvent.click(within(list).getByRole('radio', { name: /Tue B/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Change class' }))

    expect(onBook).toHaveBeenCalledWith({
      kind: 'change',
      fromClassroomId: 1,
      fromDate: '2026-11-02',
      toClassroomId: 2,
      toDate: '2026-11-03',
      note: null,
    })
  })

  it('puts the lesson list away after a booking, behind "Book another"', async () => {
    setup()

    await userEvent.selectOptions(screen.getByLabelText('Their lesson'), screen.getByRole('option', { name: /Mon A/ }))
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Lesson to sit in' })).getByRole('radio', { name: /Tue B/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Change class' }))

    expect(screen.queryByRole('radiogroup', { name: 'Lesson to sit in' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Book another' }))
    expect(screen.getByLabelText('Their lesson')).toBeInTheDocument()
  })

  it('books a replacement for a lesson that has passed', async () => {
    const { onBook } = setup()

    await userEvent.click(screen.getByRole('tab', { name: 'Replacement' }))
    await userEvent.selectOptions(screen.getByLabelText('Their lesson'), screen.getByRole('option', { name: /Absent/ }))
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Lesson to sit in' })).getByRole('radio', { name: /Tue C/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Book replacement' }))

    expect(onBook).toHaveBeenCalledWith(expect.objectContaining({ kind: 'replacement', fromDate: '2026-10-26', toClassroomId: 3 }))
  })

  it('shows what the database says when it refuses', async () => {
    setup({ onBook: vi.fn().mockResolvedValue('Attendance is already taken for this student in that lesson. Use Replacement.') })

    await userEvent.selectOptions(screen.getByLabelText('Their lesson'), screen.getByRole('option', { name: /Mon A/ }))
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Lesson to sit in' })).getByRole('radio', { name: /Tue B/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Change class' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Use Replacement')
  })

  it('lists the booked seats with Undo', async () => {
    const seat: LessonSeat = { id: 7, studentId: 1, kind: 'change', fromClassroomId: 1, fromDate: '2026-11-02', toClassroomId: 2, toDate: '2026-11-03', note: null }
    const { onUndo } = setup({ seats: [seat] })

    const booked = screen.getByRole('region', { name: 'Booked lessons' })
    expect(within(booked).getByText(/Change class/)).toBeInTheDocument()
    await userEvent.click(within(booked).getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledWith(7)
  })

  it('only looks when the account may not edit', () => {
    setup({ canEdit: false })

    expect(screen.queryByLabelText('Their lesson')).not.toBeInTheDocument()
    expect(screen.getByText(/can look at these lessons/)).toBeInTheDocument()
  })
})
