import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getTodayString } from './domain/studentStatus'

type Call = { op: 'update' | 'delete'; payload?: unknown; ids: number[] }

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  calls: [] as Call[],
  rpc: vi.fn(),
  // What the query chain answers; a test can make it fail.
  error: null as null | { message: string },
}))

vi.mock('./lib/supabase', () => {
  const chain = (op: 'update' | 'delete', payload?: unknown) => ({
    in: (_column: string, ids: number[]) => ({
      select: async () => {
        mocks.calls.push({ op, payload, ids })
        return mocks.error
          ? { data: null, error: mocks.error }
          : { data: ids.map((id) => ({ id })), error: null }
      },
    }),
  })
  return {
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
      from: () => ({
        insert: vi.fn(),
        update: (payload: unknown) => chain('update', payload),
        delete: () => chain('delete'),
      }),
      rpc: (...args: unknown[]) => mocks.rpc(...args),
    },
  }
})
vi.mock('@fullcalendar/react', () => ({ default: () => <div>Calendar ready</div> }))

const lead = (id: number, name: string, patch: object = {}) => ({
  id,
  fullName: name,
  phone: `6012000000${id}`,
  sourceId: 1,
  picId: null,
  tagIds: [] as number[],
  checks: {},
  status: 'new',
  children: [],
  notes: null,
  followUps: [],
  tasks: [],
  convertedStudentId: null,
  addedDate: getTodayString(),
  createdAt: '',
  updatedAt: '',
  ...patch,
})

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
      permissions: { leads: { level: 'edit', delete: true } },
    },
  ],
  fetchLeadsFromSupabase: async () => [
    lead(1, 'Mrs Lim'),
    lead(2, 'Mr Tan', { tagIds: [201] }),
    lead(3, 'Ms Goh', { status: 'converted', convertedStudentId: 7 }),
  ],
  fetchLeadOptionsFromSupabase: async () => [
    { id: 1, kind: 'source', label: 'Walk-in', isActive: true, legacyKey: 'walk_in', color: null },
    { id: 2, kind: 'source', label: 'Referral', isActive: true, legacyKey: 'referral', color: null },
    { id: 10, kind: 'pic', label: 'Alex', isActive: true, legacyKey: null, color: null },
    { id: 201, kind: 'tag', label: 'Hot', isActive: true, legacyKey: null, color: '#ef4444' },
    { id: 202, kind: 'tag', label: 'VIP', isActive: true, legacyKey: null, color: '#8b5cf6' },
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

async function openLeadsAndSelect(names: string[]) {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'user-4' } }))
  await screen.findByText(/Workspace$/)
  const table = within(await screen.findByRole('table'))
  for (const name of names) {
    await userEvent.click(table.getByRole('checkbox', { name: `Select ${name}` }))
  }
  return within(screen.getByRole('region', { name: 'Bulk actions' }))
}

const activityCalls = () =>
  mocks.rpc.mock.calls.filter(([name]) => name === 'record_admin_activity').map(([, args]) => args)

describe('bulk actions on leads', () => {
  beforeEach(() => {
    mocks.calls = []
    mocks.error = null
    mocks.rpc.mockReset().mockResolvedValue({ data: 1, error: null })
  })

  it('asks first, then changes the stage of the selected leads and logs one line', async () => {
    const bar = await openLeadsAndSelect(['Mrs Lim', 'Mr Tan'])

    await userEvent.selectOptions(bar.getByLabelText('Change stage'), 'contacted')
    expect(await screen.findByText('Move 2 leads to Contacted?')).toBeInTheDocument()
    // Nothing happens until it is confirmed.
    expect(mocks.calls).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mocks.calls).toEqual([{ op: 'update', payload: { status: 'contacted' }, ids: [1, 2] }]),
    )
    expect(await screen.findByText('Updated 2 leads.')).toBeInTheDocument()
    expect(activityCalls()).toEqual([
      {
        p_action_type: 'lead_bulk_updated',
        p_entity_type: 'lead',
        p_entity_id: null,
        p_entity_label: '2 leads',
        p_details: { bulk_action: 'stage', value: 'contacted', count: 2 },
      },
    ])
    // The selection is cleared once it is done.
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('changes nothing when the question is cancelled, and keeps the selection', async () => {
    const bar = await openLeadsAndSelect(['Mrs Lim'])

    await userEvent.selectOptions(bar.getByLabelText('Set PIC'), 'Alex')
    expect(await screen.findByText('Assign 1 lead to Alex?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mocks.calls).toHaveLength(0)
    expect(activityCalls()).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument()
  })

  it('leaves converted leads out of a stage change and says so', async () => {
    const bar = await openLeadsAndSelect(['Mrs Lim', 'Ms Goh'])

    await userEvent.selectOptions(bar.getByLabelText('Change stage'), 'lost')

    expect(await screen.findByText(/Move 1 lead to Lost\?/)).toBeInTheDocument()
    expect(screen.getByText(/Left as they are: 1 already converted\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mocks.calls[0].ids).toEqual([1]))
  })

  it('sets and clears the PIC, and changes the source', async () => {
    let bar = await openLeadsAndSelect(['Mrs Lim', 'Mr Tan'])

    await userEvent.selectOptions(bar.getByLabelText('Set source'), 'Referral')
    expect(await screen.findByText('Set the source of 2 leads to Referral?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.calls).toEqual([{ op: 'update', payload: { source_id: 2 }, ids: [1, 2] }]),
    )
    expect(activityCalls()[0]).toMatchObject({
      p_details: { bulk_action: 'source', value: 'Referral', count: 2 },
    })
    expect(await screen.findByText('Updated 2 leads.')).toBeInTheDocument()

    // Select them again to clear their PIC: nobody has one, so there is nothing to do.
    bar = within(screen.getByRole('table'))
    await userEvent.click(bar.getByRole('checkbox', { name: 'Select Mrs Lim' }))
    await userEvent.selectOptions(
      within(screen.getByRole('region', { name: 'Bulk actions' })).getByLabelText('Set PIC'),
      'Not assigned',
    )
    expect(
      await screen.findByText('Nothing to change: the selected leads are already like that.'),
    ).toBeInTheDocument()
  })

  it('adds a tag through the database function and only counts the leads that gain it', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'bulk_set_lead_tag' ? { data: 1, error: null } : { data: null, error: null },
    )
    const bar = await openLeadsAndSelect(['Mrs Lim', 'Mr Tan'])

    await userEvent.selectOptions(bar.getByLabelText('Add tag'), 'Hot')

    // Mr Tan has Hot already.
    expect(await screen.findByText(/Add the tag Hot to 1 lead\?/)).toBeInTheDocument()
    expect(screen.getByText(/Left as they are: 1 already like that\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('bulk_set_lead_tag', {
        p_lead_ids: [1],
        p_tag_id: 201,
        p_add: true,
      }),
    )
    expect(activityCalls()[0]).toMatchObject({
      p_details: { bulk_action: 'tag-add', value: 'Hot', count: 1 },
    })
  })

  it('removes a tag only from the leads that have it', async () => {
    const bar = await openLeadsAndSelect(['Mrs Lim', 'Mr Tan'])

    await userEvent.selectOptions(bar.getByLabelText('Remove tag'), 'Hot')

    expect(await screen.findByText(/Remove the tag Hot from 1 lead\?/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('bulk_set_lead_tag', {
        p_lead_ids: [2],
        p_tag_id: 201,
        p_add: false,
      }),
    )
  })

  it('deletes the selected leads only after a clear warning, and logs it', async () => {
    const bar = await openLeadsAndSelect(['Mrs Lim', 'Mr Tan'])

    await userEvent.click(bar.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/Delete 2 leads\?/)).toBeInTheDocument()
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument()
    expect(mocks.calls).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Delete 2 leads' }))

    await waitFor(() => expect(mocks.calls).toEqual([{ op: 'delete', payload: undefined, ids: [1, 2] }]))
    expect(await screen.findByText('Deleted 2 leads.')).toBeInTheDocument()
    expect(activityCalls()[0]).toMatchObject({
      p_action_type: 'lead_bulk_deleted',
      p_details: { bulk_action: 'delete', count: 2 },
    })
  })

  it('tells what went wrong, logs nothing and keeps the selection when the database refuses', async () => {
    mocks.error = { message: 'permission denied for table leads' }
    const bar = await openLeadsAndSelect(['Mrs Lim'])

    await userEvent.selectOptions(bar.getByLabelText('Change stage'), 'lost')
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText(/permission denied/)).toBeInTheDocument()
    expect(activityCalls()).toHaveLength(0)
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument()
  })
})
