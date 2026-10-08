import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// An admin setting a class time must be told when that teacher is already
// teaching something else then (one teacher can't be in two places).

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  from: vi.fn(),
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
    from: mocks.from,
    rpc: mocks.rpc,
  },
}))

vi.mock('@fullcalendar/react', () => ({
  default: () => <div aria-label="calendar" />,
}))

const admin = {
  id: 1,
  authUserId: 'admin-1',
  username: 'admin',
  fullName: 'Admin',
  role: 'admin',
  isActive: true,
  permissions: {},
}
const jiaHui = {
  id: 2,
  authUserId: 'teacher-1',
  username: 'jiahui',
  fullName: 'Jia Hui',
  role: 'teacher',
  isActive: true,
  permissions: {},
}

const classroom = {
  id: 1,
  name: 'Jia Hui Coding',
  category: 'regular',
  ageGroup: '6-8 Years Old',
  programLevel: 'Coder Foundation',
  teacherId: 2,
  status: 'active',
  notes: null,
  archivedAt: null,
}

// Tuesdays 7:30-9:30pm from 1 Sep 2026.
const tuesdayClass = {
  id: 10,
  teacherId: 2,
  classroomId: 1,
  title: 'Jia Hui Coding',
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

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [admin, jiaHui],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [classroom],
  fetchStudentsFromSupabase: async () => [
    {
      id: 501,
      teacherId: 2,
      classroomId: 1,
      name: 'Ada Lovelace',
      phone: null,
      age: null,
      remainingHours: 10,
      lessonExpiryDate: '2026-12-31',
      accountFeeExpiryDate: '2026-12-31',
      miraiClubExpiryDate: '2026-12-31',
      notes: null,
      isActive: true,
      studentType: 'regular',
    },
  ],
  fetchSchedulesFromSupabase: async () => [tuesdayClass],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchMakeupPlansFromSupabase: async () => [],
  fetchLeadOptionsFromSupabase: async () => [],
  fetchPackagesFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityForDay: async () => [],
}))

// Tables the app wrote to via supabase.from('schedules') - the save attempt.
const scheduleSaves = () => mocks.from.mock.calls.filter(([table]) => table === 'schedules')

async function openNewReplacementClass() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await userEvent.click(await screen.findByRole('button', { name: 'Add Class' }))
  return within(await screen.findByRole('dialog'))
}

function fillReplacement(
  dialog: ReturnType<typeof within>,
  { date, start, end }: { date: string; start: string; end: string },
) {
  fireEvent.change(dialog.getByLabelText('Teacher'), { target: { value: '2' } })
  fireEvent.change(dialog.getByLabelText('Scheduled Date'), { target: { value: date } })
  fireEvent.change(dialog.getAllByLabelText('Start Time')[0], { target: { value: start } })
  fireEvent.change(dialog.getAllByLabelText('End Time')[0], { target: { value: end } })
}

describe('teacher time clashes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    // Any attempt to save fails here; these tests only care whether it is tried.
    mocks.from.mockReturnValue({
      insert: () => ({
        select: () => ({ single: async () => ({ data: null, error: new Error('stop') }) }),
      }),
    })
  })

  it('warns while the form overlaps the teacher’s other class, and clears when it is free', async () => {
    const dialog = await openNewReplacementClass()

    // 2026-09-15 is a Tuesday.
    fillReplacement(dialog, { date: '2026-09-15', start: '20:00', end: '21:00' })

    const alert = await dialog.findByRole('alert')
    expect(alert).toHaveTextContent('Jia Hui is already teaching at this time')
    expect(alert).toHaveTextContent('Jia Hui Coding - Tuesday 7:30pm-9:30pm')

    fireEvent.change(dialog.getByLabelText('Scheduled Date'), { target: { value: '2026-09-16' } })
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument()

    // Back on the Tuesday but after the class has finished.
    fillReplacement(dialog, { date: '2026-09-15', start: '21:30', end: '22:30' })
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks before saving a clashing time, and only saves if the admin insists', async () => {
    const dialog = await openNewReplacementClass()
    fillReplacement(dialog, { date: '2026-09-15', start: '20:00', end: '21:00' })
    await userEvent.type(dialog.getByLabelText('Class Title'), 'Extra practice')
    await userEvent.click(dialog.getByLabelText(/Ada Lovelace/))

    await userEvent.click(dialog.getByRole('button', { name: 'Create Replacement Class' }))
    expect(await screen.findByText(/Save it anyway\?/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(scheduleSaves()).toHaveLength(0)

    await userEvent.click(dialog.getByRole('button', { name: 'Create Replacement Class' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Save anyway' }))
    expect(scheduleSaves()).toHaveLength(1)
  })

  it('does not ask when the time is free', async () => {
    const dialog = await openNewReplacementClass()
    fillReplacement(dialog, { date: '2026-09-16', start: '20:00', end: '21:00' })
    await userEvent.type(dialog.getByLabelText('Class Title'), 'Extra practice')
    await userEvent.click(dialog.getByLabelText(/Ada Lovelace/))

    await userEvent.click(dialog.getByRole('button', { name: 'Create Replacement Class' }))

    expect(screen.queryByText(/Save it anyway\?/)).not.toBeInTheDocument()
    expect(scheduleSaves()).toHaveLength(1)
  })
})
