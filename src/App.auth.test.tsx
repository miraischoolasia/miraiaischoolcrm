import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  teachers: vi.fn(),
  leads: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('./lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: (listener: typeof mocks.listener) => {
      mocks.listener = listener
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    },
    signOut: mocks.signOut,
  } },
}))
vi.mock('@fullcalendar/react', () => ({ default: () => <div>Calendar ready</div> }))
vi.mock('./lib/api', async (importOriginal) => ({
  ...await importOriginal<object>(),
  fetchTeachersFromSupabase: mocks.teachers,
  fetchLeadsFromSupabase: mocks.leads,
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

const teacher = { id: 1, authUserId: 'user-1', username: 'teacher', fullName: 'Test Teacher', role: 'teacher', isActive: true }
async function signIn(id = 'user-1') {
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id } }))
}

describe('login data loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.teachers.mockResolvedValue([teacher])
    mocks.leads.mockResolvedValue([])
    mocks.signOut.mockImplementation(async () => {
      mocks.listener?.('SIGNED_OUT', null)
      return { error: null }
    })
  })

  it('keeps the session when an unrelated query fails and recovers with Retry', async () => {
    mocks.leads.mockRejectedValueOnce(new Error('Network unavailable'))
    render(<App />)
    await screen.findByText('Sign in to continue.')
    await signIn()
    await screen.findByText('Unable to load your workspace')
    expect(mocks.signOut).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Calendar ready')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('retains the reason for rejecting a successfully loaded unlinked account', async () => {
    mocks.teachers.mockResolvedValue([])
    render(<App />)
    await screen.findByText('Sign in to continue.')
    await signIn()
    await screen.findByText("This login isn't linked to a teacher profile. Contact your admin.")
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('waits for the new account data instead of rejecting it against old teachers', async () => {
    render(<App />)
    await screen.findByText('Sign in to continue.')
    await signIn()
    await screen.findByText('Calendar ready')
    let resolveTeachers!: (value: unknown[]) => void
    mocks.teachers.mockReturnValueOnce(new Promise((resolve) => { resolveTeachers = resolve }))
    await signIn('user-2')
    expect(mocks.signOut).not.toHaveBeenCalled()
    await act(async () => resolveTeachers([{ ...teacher, authUserId: 'user-2' }]))
    await waitFor(() => expect(screen.getByText('Calendar ready')).toBeInTheDocument())
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('does not reload core data for the same user on a refreshed session object', async () => {
    // Supabase's auto token refresh — including the proactive refresh it
    // runs whenever this browser tab regains focus — hands
    // onAuthStateChange a brand-new session object for the *same* signed-in
    // user. That must not be treated like a fresh sign-in: doing so blanks
    // the whole screen while data reloads, discarding whatever the admin was
    // typing (e.g. a half-filled form in an open modal).
    render(<App />)
    await screen.findByText('Sign in to continue.')
    await signIn()
    await screen.findByText('Calendar ready')

    expect(mocks.teachers).toHaveBeenCalledTimes(1)
    expect(mocks.leads).toHaveBeenCalledTimes(1)

    await act(async () => mocks.listener?.('TOKEN_REFRESHED', { user: { id: 'user-1' } }))

    expect(screen.getByText('Calendar ready')).toBeInTheDocument()
    expect(mocks.teachers).toHaveBeenCalledTimes(1)
    expect(mocks.leads).toHaveBeenCalledTimes(1)
  })
})
