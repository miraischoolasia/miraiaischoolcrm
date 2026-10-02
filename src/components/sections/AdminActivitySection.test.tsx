import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminActivitySection } from './AdminActivitySection'
import type { AdminActivity, Teacher } from '../../types/domain'

const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString()

const activities: AdminActivity[] = [
  { id: 3, actorTeacherId: 1, actionType: 'lead_deleted', entityType: 'lead', entityId: 1, entityLabel: 'Testing', details: {}, createdAt: at('2026-10-03', 15) },
  { id: 2, actorTeacherId: 2, actionType: 'student_renewed', entityType: 'student', entityId: 5, entityLabel: 'Branson See', details: { classes_added: 4 }, createdAt: at('2026-10-03', 9) },
  { id: 1, actorTeacherId: 1, actionType: 'classroom_created', entityType: 'classroom', entityId: 10, entityLabel: 'Wed Coder Pro', details: {}, createdAt: at('2026-10-01', 9) },
]
const teacher = (id: number, fullName: string) =>
  ({ id, fullName, role: 'admin', isActive: true, permissions: {} }) as unknown as Teacher
const teacherMap = new Map([
  [1, teacher(1, 'Admin Demo')],
  [2, teacher(2, 'Front Desk')],
])

function renderSection() {
  render(<AdminActivitySection activities={activities} teacherMap={teacherMap} todayString="2026-10-03" />)
}

const titles = () =>
  [...document.querySelectorAll('li span.text-sm.font-semibold')].map((node) => node.textContent)

describe('AdminActivitySection', () => {
  it('groups entries by day with plain sentences', () => {
    renderSection()

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Today',
      'Oct 1, 2026',
    ])
    expect(titles()).toEqual(['Deleted lead Testing', 'Renewed Branson See', 'Added classroom Wed Coder Pro'])
    expect(screen.getAllByText('by Admin Demo')).toHaveLength(2)
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
