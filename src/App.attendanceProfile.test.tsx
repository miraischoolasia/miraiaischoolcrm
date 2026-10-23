import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openMenu } from './test/openMenu'

// From a class's attendance window, a student's name opens their profile.

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
  await openMenu('Timetable')
  await userEvent.click(await screen.findByRole('button', { name: 'make-up card' }))
}

describe('student profile from a class on the calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.plans.mockResolvedValue([plan(null)])
    mocks.logs.mockResolvedValue([])
    mocks.latest.mockResolvedValue({ summary: null, students: [], reviews: [] })
  })

  it("opens the student's profile above the class window, and keeps the class window open", async () => {
    await signInAndOpenMakeupCard()
    await screen.findByText('Ada Lovelace')

    await userEvent.click(screen.getByRole('button', { name: "Open Ada Lovelace's profile" }))

    // The profile is a second window; the class stays open beneath it.
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2))
    const dialogs = screen.getAllByRole('dialog')
    // The class lists both children; the profile is the other one.
    const classWindow = dialogs.find((dialog) => within(dialog).queryByText('Ben Carter'))!
    const profile = dialogs.find((dialog) => dialog !== classWindow)!
    expect(classWindow).toBeDefined()
    expect(within(profile).getAllByText('Ada Lovelace').length).toBeGreaterThan(0)
    // Raised above the class window, whatever the order they were opened in.
    expect(profile.closest('[class~="z-[60]"]')).not.toBeNull()
    expect(classWindow.closest('[class~="z-[60]"]')).toBeNull()
  })
})
