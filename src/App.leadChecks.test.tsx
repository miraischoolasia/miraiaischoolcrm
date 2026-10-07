import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getTodayString } from './domain/studentStatus'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  // What the database holds for the one lead; the rpc below changes it.
  checks: {} as Record<string, { at: string; by: number }>,
  rpc: vi.fn(),
}))

vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      signOut: vi.fn(),
    },
    from: () => ({ insert: vi.fn() }),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}))
vi.mock('@fullcalendar/react', () => ({ default: () => <div>Calendar ready</div> }))
vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    {
      id: 4,
      authUserId: 'user-4',
      username: 'desk',
      fullName: 'Front Desk',
      isActive: true,
      role: 'staff',
      permissions: { leads: { level: 'edit' } },
    },
  ],
  fetchLeadsFromSupabase: async () => [
    {
      id: 900,
      fullName: 'Parent',
      phone: '60123456789',
      sourceId: null,
      picId: null,
      tagIds: [],
      checks: Object.fromEntries(
        Object.entries(mocks.checks).map(([slot, stamp]) => [slot, { ...stamp }]),
      ),
      status: 'new',
      children: [],
      notes: null,
      followUps: [],
      tasks: [],
      convertedStudentId: null,
      addedDate: getTodayString(),
      createdAt: '',
      updatedAt: '',
    },
  ],
  fetchLeadOptionsFromSupabase: async () => [
    { id: 101, kind: 'check', label: 'RM99 pack', isActive: true, legacyKey: 'check_1', color: null },
    { id: 102, kind: 'check', label: 'Joined event', isActive: true, legacyKey: 'check_2', color: null },
    { id: 103, kind: 'check', label: 'Paid deposit', isActive: true, legacyKey: 'check_3', color: null },
  ],
  fetchClassroomsFromSupabase: async () => [],
  fetchStudentsFromSupabase: async () => [],
  fetchSchedulesFromSupabase: async () => [],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchMakeupPlansFromSupabase: async () => [],
  fetchPackagesFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityForDay: async () => [],
}))

async function openLeads() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'user-4' } }))
  await screen.findByText(/Workspace$/)
  return within(await screen.findByRole('table'))
}

describe('ticking the boxes of a lead', () => {
  beforeEach(() => {
    mocks.checks = {}
    mocks.rpc.mockReset()
  })

  it('ticks a box in the database and keeps it ticked after the lead is loaded back', async () => {
    mocks.rpc.mockImplementation(async (name: string, args: { p_slot: number; p_checked: boolean }) => {
      expect(name).toBe('set_lead_check')
      mocks.checks = args.p_checked
        ? { [String(args.p_slot)]: { at: '2026-10-05T03:00:00Z', by: 4 } }
        : {}
      return { data: true, error: null }
    })
    const table = await openLeads()

    const box = table.getByRole('checkbox', { name: 'RM99 pack for Parent' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)

    expect(box).toBeChecked()
    expect(mocks.rpc).toHaveBeenCalledWith('set_lead_check', {
      p_lead_id: 900,
      p_slot: 1,
      p_checked: true,
    })
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1))
    // After the lead is read back it says who ticked it.
    await waitFor(() =>
      expect(table.getByRole('checkbox', { name: 'RM99 pack for Parent' })).toHaveAttribute(
        'title',
        expect.stringContaining('Ticked by Front Desk'),
      ),
    )
  })

  it('unticks a box', async () => {
    mocks.checks = { '2': { at: '2026-10-05T03:00:00Z', by: 4 } }
    mocks.rpc.mockImplementation(async () => {
      mocks.checks = {}
      return { data: true, error: null }
    })
    const table = await openLeads()

    const box = table.getByRole('checkbox', { name: 'Joined event for Parent' })
    expect(box).toBeChecked()
    await userEvent.click(box)

    expect(box).not.toBeChecked()
    expect(mocks.rpc).toHaveBeenCalledWith('set_lead_check', {
      p_lead_id: 900,
      p_slot: 2,
      p_checked: false,
    })
  })

  it('puts the box back and says so when the database refuses', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const table = await openLeads()

    const box = table.getByRole('checkbox', { name: 'Paid deposit for Parent' })
    await userEvent.click(box)

    await waitFor(() => expect(box).not.toBeChecked())
    expect(await screen.findByText(/permission denied/)).toBeInTheDocument()
  })

  it('puts the box back when no lead was changed', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null })
    const table = await openLeads()

    const box = table.getByRole('checkbox', { name: 'RM99 pack for Parent' })
    await userEvent.click(box)

    await waitFor(() => expect(box).not.toBeChecked())
    expect(await screen.findByText('This lead could not be changed.')).toBeInTheDocument()
  })
})
