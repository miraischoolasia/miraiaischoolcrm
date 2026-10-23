import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openMenu } from './test/openMenu'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  rpc: vi.fn(),
  // How many weekly classes there are on Mondays.
  classes: 12,
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
    rpc: mocks.rpc,
  },
}))

// FullCalendar's stand-in: the classes it was given, by name.
vi.mock('@fullcalendar/react', () => ({
  default: (props: { events: { id: string; title: string; extendedProps?: Record<string, unknown> }[] }) => (
    <ul aria-label="calendar events">
      {props.events
        .filter((event) => !event.extendedProps?.isHoliday)
        .map((event) => (
          <li key={event.id}>{event.title}</li>
        ))}
    </ul>
  ),
}))

const ids = () => Array.from({ length: mocks.classes }, (_, index) => index + 1)

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Ms Tina', role: 'admin', isActive: true, permissions: {} },
  ],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () =>
    ids().map((id) => ({
      id,
      name: `Class ${id}`,
      category: 'regular',
      ageGroup: 'Form 1',
      programLevel: 'Regular',
      teacherId: 1,
      status: 'active',
      notes: null,
      archivedAt: null,
    })),
  fetchStudentsFromSupabase: async () =>
    ids().map((id) => ({
      id: 500 + id,
      teacherId: 1,
      classroomId: id,
      name: `Kid ${id}`,
      phone: null,
      age: null,
      remainingHours: 10,
      lessonExpiryDate: '2026-12-31',
      accountFeeExpiryDate: '2026-12-31',
      miraiClubExpiryDate: '2026-12-31',
      notes: null,
      isActive: true,
      studentType: 'regular',
    })),
  fetchSchedulesFromSupabase: async () =>
    ids().map((id) => ({
      id: 100 + id,
      teacherId: 1,
      classroomId: id,
      title: `Class ${id}`,
      eventType: 'regular',
      recurrenceType: 'weekly',
      dayOfWeek: 1,
      scheduledDate: null,
      startTime: '15:45',
      endTime: '17:00',
      startRecur: '2026-10-01',
      endRecur: null,
      status: 'active',
      notes: null,
    })),
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

async function signInAndOpenCalendar() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await openMenu('Timetable')
}

describe('the Calendar day list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    window.localStorage.clear()
    // Monday 19 Oct 2026, 10:00.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 19, 10, 0) })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is what a school with many classes a day sees: today by start time, no child named on a card', async () => {
    mocks.classes = 12
    await signInAndOpenCalendar()

    expect(await screen.findByRole('group', { name: 'Calendar view' })).toBeInTheDocument()
    expect(screen.getByText('12 classes')).toBeInTheDocument()
    const slot = screen.getByRole('region', { name: '3:45 pm classes' })
    expect(within(slot).getAllByRole('button', { name: /^Class \d+, Ms Tina, 1 student$/ })).toHaveLength(12)
    expect(screen.queryByText('Kid 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'calendar events' })).not.toBeInTheDocument()
  })

  it('opens a class with its list, attendance and the schedule window, and switches to the month calendar and back', async () => {
    mocks.classes = 12
    await signInAndOpenCalendar()

    await userEvent.click(await screen.findByRole('button', { name: 'Class 3, Ms Tina, 1 student' }))
    const window = screen.getByRole('dialog')
    expect(within(window).getByRole('heading', { name: 'Class 3' })).toBeInTheDocument()
    expect(within(window).getByRole('button', { name: 'Take attendance (1)' })).toBeInTheDocument()
    await userEvent.click(within(window).getByRole('button', { name: /Class list/ }))
    expect(within(window).getByRole('list', { name: 'Class list' })).toHaveTextContent('Kid 3')
    await userEvent.click(within(window).getByRole('button', { name: 'Close' }))

    await userEvent.click(within(screen.getByRole('group', { name: 'Calendar view' })).getByRole('button', { name: 'Month' }))
    expect(await screen.findByRole('list', { name: 'calendar events' })).toHaveTextContent('Class 1')
    await userEvent.click(screen.getByRole('button', { name: '← Back to the day list' }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Calendar view' })).toBeInTheDocument())
  })

  it('uses the same filters as the month calendar', async () => {
    mocks.classes = 12
    await signInAndOpenCalendar()
    expect(await screen.findByText('12 classes')).toBeInTheDocument()

    // The admin teaches these classes.
    await userEvent.click(screen.getByRole('button', { name: 'Only mine' }))
    expect(screen.getByText('12 classes')).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('group', { name: 'Kinds shown' })).getByRole('button', { name: 'Make-ups' }))
    expect(screen.getByText('0 classes')).toBeInTheDocument()
    expect(screen.getByText('Nothing on this day with these filters.')).toBeInTheDocument()
  })

  it('leaves a school with a few classes a day on the month calendar', async () => {
    mocks.classes = 5
    await signInAndOpenCalendar()

    expect(await screen.findByRole('list', { name: 'calendar events' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Calendar view' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '← Back to the day list' })).not.toBeInTheDocument()
  })
})
