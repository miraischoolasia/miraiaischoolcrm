import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminActivitySection } from './AdminActivitySection'
import type { AdminActivity, Teacher } from '../../types/domain'

const at = (hour: number) => new Date(`2026-10-03T${String(hour).padStart(2, '0')}:00:00`).toISOString()

const activities: AdminActivity[] = [
  { id: 3, actorTeacherId: 1, actionType: 'lead_deleted', entityType: 'lead', entityId: 1, entityLabel: 'Testing', details: {}, createdAt: at(15) },
  { id: 2, actorTeacherId: 2, actionType: 'student_renewed', entityType: 'student', entityId: 5, entityLabel: 'Branson See', details: { classes_added: 4 }, createdAt: at(11) },
  { id: 1, actorTeacherId: 1, actionType: 'classroom_created', entityType: 'classroom', entityId: 10, entityLabel: 'Wed Coder Pro', details: {}, createdAt: at(9) },
]
const teacher = (id: number, fullName: string) =>
  ({ id, fullName, role: 'admin', isActive: true, permissions: {} }) as unknown as Teacher
const teacherMap = new Map([
  [1, teacher(1, 'Admin Demo')],
  [2, teacher(2, 'Front Desk')],
])

function renderSection(day = '2026-10-03', onChangeDay = vi.fn()) {
  render(
    <AdminActivitySection
      activities={activities}
      teacherMap={teacherMap}
      todayString="2026-10-03"
      day={day}
      onChangeDay={onChangeDay}
    />,
  )
  return onChangeDay
}

const titles = () =>
  [...document.querySelectorAll('li span.text-sm.font-semibold')].map((node) => node.textContent)

describe('AdminActivitySection', () => {
  it('shows the day with plain sentences', () => {
    renderSection()

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Today · 3 changes')
    expect(titles()).toEqual(['Deleted lead Testing', 'Renewed Branson See', 'Added classroom Wed Coder Pro'])
    expect(screen.getAllByText('by Admin Demo')).toHaveLength(2)
  })

  it('steps through days but not past today', async () => {
    const onChangeDay = renderSection()

    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(onChangeDay).toHaveBeenCalledWith('2026-10-02')
  })

  it('offers a way back to today from an older day', async () => {
    const onChangeDay = renderSection('2026-09-30')

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Sep 30, 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(onChangeDay).toHaveBeenLastCalledWith('2026-10-01')
    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(onChangeDay).toHaveBeenLastCalledWith('2026-10-03')
  })

  it('filters by area, person and name', async () => {
    renderSection()

    await userEvent.click(screen.getByRole('button', { name: 'Students' }))
    expect(titles()).toEqual(['Renewed Branson See'])

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter activity by person' }), 'Admin Demo')
    expect(titles()).toEqual(['Deleted lead Testing', 'Added classroom Wed Coder Pro'])

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search activity' }), 'wed')
    expect(titles()).toEqual(['Added classroom Wed Coder Pro'])
  })
})
