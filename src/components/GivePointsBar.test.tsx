import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GivePointsBar } from './GivePointsBar'
import type { PointsEntry, RewardPreset } from '../lib/rewards'

const mocks = vi.hoisted(() => ({
  fetchLessonPoints: vi.fn(),
  awardPoints: vi.fn(),
  undoPoints: vi.fn(),
}))

vi.mock('../lib/rewards', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchLessonPoints: mocks.fetchLessonPoints,
  awardPoints: mocks.awardPoints,
  undoPoints: mocks.undoPoints,
}))

const presets: RewardPreset[] = [
  { id: 1, label: 'Great answer', points: 5, emoji: '🌟', sortOrder: 10, isActive: true },
  { id: 2, label: 'Old one', points: 2, emoji: null, sortOrder: 20, isActive: false },
]
const students = [
  { id: 11, name: 'Ava' },
  { id: 12, name: 'Ben' },
]
const award: PointsEntry = {
  id: 90, studentId: 11, points: 5, kind: 'award', reason: 'Great answer', scheduleId: 3, lessonDate: '2026-10-15',
  reversesId: null, createdBy: 1, createdAt: '2026-10-15T10:00:00Z',
}

function renderBar() {
  render(<GivePointsBar scheduleId={3} lessonDate="2026-10-15" students={students} presets={presets} />)
}

describe('GivePointsBar', () => {
  beforeEach(() => {
    mocks.fetchLessonPoints.mockReset().mockResolvedValue([])
    mocks.awardPoints.mockReset().mockResolvedValue(null)
    mocks.undoPoints.mockReset().mockResolvedValue(null)
  })

  it('shows only the rewards that are on', () => {
    renderBar()
    expect(screen.getByRole('button', { name: '🌟 Great answer +5' })).toBeInTheDocument()
    expect(screen.queryByText(/Old one/)).not.toBeInTheDocument()
  })

  it('gives a reward to everyone in class', async () => {
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: '🌟 Great answer +5' }))
    await userEvent.click(screen.getByRole('button', { name: 'Give +5 to 2' }))

    expect(mocks.awardPoints).toHaveBeenCalledWith({
      studentIds: [11, 12], presetId: 1, points: null, reason: null, scheduleId: 3, lessonDate: '2026-10-15',
    })
    expect(await screen.findByText('Gave 5 points to 2 students.')).toBeInTheDocument()
  })

  it('gives own points to the students picked', async () => {
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: 'Other…' }))
    const amount = screen.getByRole('spinbutton', { name: 'Points to give' })
    await userEvent.clear(amount)
    await userEvent.type(amount, '8')
    await userEvent.type(screen.getByRole('textbox', { name: 'What the points are for' }), 'Best game')
    await userEvent.click(screen.getByRole('button', { name: 'Ben' }))
    await userEvent.click(screen.getByRole('button', { name: 'Give +8 to 1' }))

    expect(mocks.awardPoints).toHaveBeenCalledWith({
      studentIds: [11], presetId: null, points: 8, reason: 'Best game', scheduleId: 3, lessonDate: '2026-10-15',
    })
  })

  it('shows what each student got, lists the awards and undoes one', async () => {
    mocks.fetchLessonPoints.mockResolvedValue([award])
    renderBar()

    expect(await screen.findByText('Ava: Great answer +5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ava/ })).toHaveTextContent('⭐5')
    await userEvent.click(screen.getByRole('button', { name: 'Undo Great answer for Ava' }))
    await waitFor(() => expect(mocks.undoPoints).toHaveBeenCalledWith(90))
  })

  it("shows the server's reason when giving fails", async () => {
    mocks.awardPoints.mockResolvedValue('Student 12 is not in this lesson.')
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: '🌟 Great answer +5' }))
    await userEvent.click(screen.getByRole('button', { name: 'Give +5 to 2' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Student 12 is not in this lesson.')
  })
})
