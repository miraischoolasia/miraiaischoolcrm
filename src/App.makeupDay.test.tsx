import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// A make-up slot on the 29th-31st (when a class never normally meets) used to
// be a dead end on the calendar: clicking it only toasted or opened the plan,
// so the teacher had nowhere to take attendance or leave feedback.

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  plans: vi.fn(),
  logs: vi.fn(),
  latest: vi.fn(),
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
    rpc: vi.fn(),
  },
}))

// Lists the events App built and "clicks" one at the date it carries, so the
// make-up-only card (which has an explicit start) lands on its real day.
vi.mock('@fullcalendar/react', () => ({
  default: (props: {
    events: {
      id: string
      title: string
      start?: string
      extendedProps?: Record<string, unknown>
    }[]
    eventClick: (arg: unknown) => void
    eventContent: (arg: unknown) => React.ReactNode
  }) => (
    <ul aria-label="calendar events">
      {props.events
        .filter((event) => event.extendedProps?.isMakeupOnly)
        .map((event) => {
          const start = new Date(event.start as string)
          return (
            <li key={event.id}>
              <button
                type="button"
                aria-label="make-up card"
                onClick={() =>
                  props.eventClick({
                    event: { title: event.title, start, extendedProps: event.extendedProps },
                  })
                }
              >
                {props.eventContent({
                  event: { title: event.title, start, extendedProps: event.extendedProps },
                  timeText: '7:30 PM',
                })}
              </button>
            </li>
          )
        })}
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

// Wednesday weekly class; 2026-09-30 is a Wednesday and the 30th.
const weekly = {
  id: 10,
  teacherId: 1,
  classroomId: 1,
  title: 'Regular Coding',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 3,
  scheduledDate: null,
  startTime: '19:30',
  endTime: '21:30',
  startRecur: '2026-09-01',
  endRecur: null,
  status: 'active',
  notes: null,
}

function student(id: number, name: string) {
  return {
    id,
    teacherId: 1,
    classroomId: 1,
    name,
    phone: null,
    age: null,
    remainingHours: 10,
    lessonExpiryDate: '2026-12-31',
    accountFeeExpiryDate: '2026-12-31',
    miraiClubExpiryDate: '2026-12-31',
    notes: null,
    isActive: true,
    studentType: 'regular',
  }
}

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', isActive: true, permissions: {} },
  ],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [classroom],
  fetchStudentsFromSupabase: async () => [student(501, 'Ada Lovelace'), student(502, 'Ben Carter')],
  fetchSchedulesFromSupabase: async () => [weekly],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchMakeupPlansFromSupabase: () => mocks.plans(),
  fetchLeadOptionsFromSupabase: async () => [],
  fetchPackagesFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: () => mocks.logs(),
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchLatestLessonLogStudents: () => mocks.latest(),
  fetchAdminActivityForDay: async () => [],
}))

function plan(studentId: number | null) {
  return {
    id: 7,
    classroomId: 1,
    missedDate: '2026-09-16',
    studentId,
    missedMinutes: 30,
    notes: null,
    sessions: [{ sessionDate: '2026-09-30', extraMinutes: 30 }],
  }
}

async function signInAndOpenMakeupCard() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await userEvent.click(await screen.findByRole('button', { name: 'make-up card' }))
}

describe('make-up card on the 29th-31st', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.logs.mockResolvedValue([])
    mocks.latest.mockResolvedValue({ summary: null, students: [], reviews: [] })
  })

  it('opens attendance for the whole class when the plan covers the whole class', async () => {
    mocks.plans.mockResolvedValue([plan(null)])
    await signInAndOpenMakeupCard()

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Ben Carter')).toBeInTheDocument()
    // The admin's way on is the plan, not a timetable entry that doesn't exist.
    expect(screen.getByRole('button', { name: 'Edit Make-up Plan' })).toBeInTheDocument()
  })

  it('lists only the student whose own plan lands that day', async () => {
    mocks.plans.mockResolvedValue([plan(501)])
    await signInAndOpenMakeupCard()

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByText('Ben Carter')).not.toBeInTheDocument()
  })

  it('shows the card as Completed once attendance has been taken', async () => {
    mocks.plans.mockResolvedValue([plan(null)])
    mocks.logs.mockResolvedValue([
      {
        id: 90,
        scheduleId: 10,
        teacherId: 1,
        lessonDate: '2026-09-30',
        lessonRemark: null,
        submittedAt: new Date().toISOString(),
        revisionNumber: 1,
        parentLogId: null,
      },
    ])
    render(<App />)
    await screen.findByText('Sign in to continue.')
    await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))

    expect(await screen.findByText('Completed')).toBeInTheDocument()
  })
})
