import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TodayByRole } from './TodayByRole'

const fetchTodayRoles = vi.fn()

vi.mock('../../lib/supabase', () => ({ supabase: null }))
vi.mock('../../lib/today', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/today')>()
  return {
    ...actual,
    fetchTodayRoles: (...args: unknown[]) => fetchTodayRoles(...args),
    fetchTodayEc: async () => null,
    fetchTodayLc: async () => null,
    fetchTodayTeam: async () => null,
  }
})

const base = {
  adminNode: <div>admin page</div>,
  teacherNode: <div>teacher page</div>,
  renderFollowUps: () => <div>follow-ups</div>,
  onOpenLead: vi.fn(),
  onOpenLeads: vi.fn(),
  onOpenStudent: vi.fn(),
}

beforeEach(() => {
  fetchTodayRoles.mockReset()
  window.localStorage.clear()
})

describe('Today by role', () => {
  it('shows the page as it was, with no tabs, to someone with one job', async () => {
    fetchTodayRoles.mockResolvedValue({ teacherId: 1, ec: false, lc: false })
    render(<TodayByRole {...base} isAdmin={false} isTeacherAccount />)
    expect(await screen.findByText('teacher page')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('gives staff with an EC job the EC version, not the general one', async () => {
    fetchTodayRoles.mockResolvedValue({ teacherId: 4, ec: true, lc: false })
    render(<TodayByRole {...base} isAdmin={false} isTeacherAccount={false} />)
    expect(await screen.findByText('follow-ups')).toBeInTheDocument()
    expect(screen.queryByText('admin page')).not.toBeInTheDocument()
  })

  it('shows tabs for two jobs and remembers the one they chose', async () => {
    fetchTodayRoles.mockResolvedValue({ teacherId: 4, ec: true, lc: true })
    const { unmount } = render(<TodayByRole {...base} isAdmin={false} isTeacherAccount={false} />)
    const lcTab = await screen.findByRole('tab', { name: 'LC' })
    await userEvent.click(lcTab)
    expect(screen.getByRole('tab', { name: 'LC' })).toHaveAttribute('aria-selected', 'true')
    unmount()
    render(<TodayByRole {...base} isAdmin={false} isTeacherAccount={false} />)
    expect(await screen.findByRole('tab', { name: 'LC' })).toHaveAttribute('aria-selected', 'true')
  })

  it('lets an admin look at another person\'s Today', async () => {
    fetchTodayRoles.mockImplementation(async (personId: number | null) =>
      personId === 2 ? { teacherId: 2, ec: true, lc: false } : { teacherId: 1, ec: false, lc: false },
    )
    render(<TodayByRole {...base} isAdmin isTeacherAccount={false} people={[{ id: 2, name: 'Mei' }]} />)
    expect(await screen.findByText('admin page')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/Look at Today of/), '2')
    await waitFor(() => expect(screen.getByText('follow-ups')).toBeInTheDocument())
    expect(screen.queryByText('admin page')).not.toBeInTheDocument()
    expect(fetchTodayRoles).toHaveBeenCalledWith(2)
  })
})
