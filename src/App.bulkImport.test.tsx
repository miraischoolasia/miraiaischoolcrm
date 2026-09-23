import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  insert: vi.fn(),
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
    from: () => ({ insert: mocks.insert }),
    rpc: mocks.rpc,
  },
}))
vi.mock('@fullcalendar/react', () => ({ default: () => <div>Calendar ready</div> }))
vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', isActive: true },
  ],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [],
  fetchStudentsFromSupabase: async () => [],
  fetchSchedulesFromSupabase: async () => [],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityFromSupabase: async () => [],
}))

const csv = 'Parent Name,Phone,Source,Stage,Added Date,Notes\nJane Tan,+65 9123 4567,referral,new,2026-09-01,\n'

function csvFile() {
  const file = new File([csv], 'leads.csv', { type: 'text/csv' })
  // Not every jsdom build implements Blob.prototype.text().
  Object.defineProperty(file, 'text', { value: async () => csv })
  return file
}

async function openBulkImportAndPickFile() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await screen.findByText('Calendar ready')

  await userEvent.click(screen.getAllByRole('button', { name: /^Leads$/ })[0])
  await userEvent.click(await screen.findByRole('button', { name: /Bulk Import/ }))
  await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, csvFile())
  await screen.findByText('1 lead ready to import')
}

describe('bulk lead import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insert.mockResolvedValue({ error: null })
  })

  it('does not report a failed import when only the activity-log entry fails', async () => {
    // record_admin_activity fails after the leads were already inserted.
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'activity log unavailable' } })
    await openBulkImportAndPickFile()

    await userEvent.click(screen.getByRole('button', { name: 'Import 1 Lead' }))

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1))
    // The modal closes instead of staying open with an error, so the admin
    // cannot re-submit the same rows.
    await waitFor(() => expect(screen.queryByText('Bulk Import Leads')).not.toBeInTheDocument())
    expect(
      await screen.findByText('Leads imported, but the activity log entry could not be saved.'),
    ).toBeInTheDocument()
    expect(mocks.insert).toHaveBeenCalledTimes(1)
  })

  it('closes quietly when both the insert and the activity log succeed', async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null })
    await openBulkImportAndPickFile()

    await userEvent.click(screen.getByRole('button', { name: 'Import 1 Lead' }))

    await waitFor(() => expect(screen.queryByText('Bulk Import Leads')).not.toBeInTheDocument())
    expect(screen.queryByText(/activity log entry could not be saved/)).not.toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_admin_activity',
      expect.objectContaining({ p_action_type: 'lead_bulk_imported' }),
    )
  })

  it('still shows the error and stays open when the insert itself fails', async () => {
    mocks.insert.mockResolvedValue({ error: new Error('insert denied') })
    await openBulkImportAndPickFile()

    await userEvent.click(screen.getByRole('button', { name: 'Import 1 Lead' }))

    expect(await screen.findByText('insert denied')).toBeInTheDocument()
    expect(screen.getByText('Bulk Import Leads')).toBeInTheDocument()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
