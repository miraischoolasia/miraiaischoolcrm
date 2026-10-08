import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  rpc: vi.fn(),
  exceptions: vi.fn(),
  lateEdit: vi.fn(),
  role: 'admin' as string,
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

// A stand-in for FullCalendar that lists the events it was given and lets a
// test "click" one, so the real filtering / click wiring in App is exercised
// without a browser layout engine.
vi.mock('@fullcalendar/react', () => ({
  default: (props: {
    events: {
      id: string
      title: string
      extendedProps?: Record<string, unknown>
    }[]
    eventClick: (arg: unknown) => void
  }) => (
    <ul aria-label="calendar events">
      {props.events
        .filter((event) => !event.extendedProps?.isHoliday)
        .map((event) => (
          <li key={event.id}>
            <button
              type="button"
              onClick={() =>
                props.eventClick({
                  event: {
                    title: event.title,
                    start: new Date(2026, 8, 8, 19, 30),
                    extendedProps: event.extendedProps,
                  },
                })
              }
            >
              {event.title}
              {event.extendedProps?.isCancelledOccurrence ? ' (cancelled)' : ''}
            </button>
          </li>
        ))}
    </ul>
  ),
}))

const classroom = {
  id: 1,
  name: 'Regular Coding',
  category: 'regular',
  ageGroup: '6-8 Years Old',
  programLevel: 'Coder Foundation',
  teacherId: 1,
  status: 'active',
  notes: null,
  archivedAt: null,
}
const weekly = {
  id: 10,
  teacherId: 1,
  classroomId: 1,
  title: 'Regular Coding',
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
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Admin', role: mocks.role, isActive: true, permissions: {} },
  ],
  fetchLateFeedbackEdit: () => mocks.lateEdit(),
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [
    classroom,
    { ...classroom, id: 2, name: 'Trial Coding', category: 'trial' },
  ],
  fetchStudentsFromSupabase: async () => [
    {
      id: 501,
      teacherId: 1,
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
    // Deactivated roster members must not be pre-checked on a new makeup class.
    {
      id: 502,
      teacherId: 1,
      classroomId: 1,
      name: 'Inactive Kid',
      phone: null,
      age: null,
      remainingHours: 0,
      lessonExpiryDate: '2026-12-31',
      accountFeeExpiryDate: '2026-12-31',
      miraiClubExpiryDate: '2026-12-31',
      notes: null,
      isActive: false,
      studentType: 'regular',
    },
    // Joined the class on 1 Oct: not in its September lessons.
    {
      id: 503,
      teacherId: 1,
      classroomId: 1,
      name: 'Late Joiner',
      phone: null,
      age: null,
      remainingHours: 12,
      lessonExpiryDate: '2026-12-31',
      accountFeeExpiryDate: '2026-12-31',
      miraiClubExpiryDate: '2026-12-31',
      notes: null,
      isActive: true,
      studentType: 'regular',
      classPeriods: [{ classroomId: 1, startDate: '2026-10-01', endDate: null }],
    },
  ],
  fetchSchedulesFromSupabase: async () => [
    weekly,
    { ...weekly, id: 11, classroomId: 2, title: 'Trial Coding' },
    {
      ...weekly,
      id: 12,
      classroomId: null,
      title: 'Makeup Session',
      eventType: 'replacement',
      recurrenceType: 'none',
      dayOfWeek: null,
      scheduledDate: '2026-09-10',
      startRecur: null,
    },
  ],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: () => mocks.exceptions(),
  fetchMakeupPlansFromSupabase: async () => [],
  fetchLeadOptionsFromSupabase: async () => [],
  fetchPackagesFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityForDay: async () => [],
}))

async function signIn() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await screen.findByRole('list', { name: 'calendar events' })
}

describe('late editing of past feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exceptions.mockResolvedValue([])
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    mocks.role = 'admin'
  })

  it('lets admin switch it on and off', async () => {
    mocks.lateEdit.mockResolvedValue(false)
    await signIn()

    const toggle = await screen.findByRole('switch', { name: /Edit past feedback: Off/ })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(toggle)
    expect(mocks.rpc).toHaveBeenCalledWith('set_late_feedback_edit', { p_open: true })
    expect(await screen.findByRole('switch', { name: /Edit past feedback: On/ })).toHaveAttribute('aria-checked', 'true')

    await userEvent.click(screen.getByRole('switch'))
    expect(mocks.rpc).toHaveBeenLastCalledWith('set_late_feedback_edit', { p_open: false })
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'))
  })

  it('tells a teacher when past feedback can be edited, without a switch', async () => {
    mocks.role = 'teacher'
    mocks.lateEdit.mockResolvedValue(true)
    await signIn()

    expect(await screen.findByText('Past feedback can be edited now')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
