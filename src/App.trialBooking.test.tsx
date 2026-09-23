import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  rpc: vi.fn(),
  role: 'admin' as 'admin' | 'teacher',
  latestLessonLog: vi.fn(),
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

// FullCalendar stand-in that renders each event through App's real
// eventContent (so the available / booked card is what is tested) and lets a
// test click it. Every occurrence is placed on Saturday 2026-09-26.
vi.mock('@fullcalendar/react', () => ({
  default: (props: {
    events: { id: string; title: string; extendedProps?: Record<string, unknown> }[]
    eventContent: (info: unknown) => React.ReactNode
    eventClick: (arg: unknown) => void
  }) => (
    <ul aria-label="calendar events">
      {props.events
        .filter((event) => !event.extendedProps?.isHoliday)
        .map((event) => {
          const [hour, minute] = String(event.extendedProps?.startTime ?? '00:00').split(':').map(Number)
          const calendarEvent = {
            title: event.title,
            start: new Date(2026, 8, 26, hour, minute),
            extendedProps: event.extendedProps,
          }
          return (
            <li key={event.id}>
              <button
                type="button"
                aria-label={`slot ${event.extendedProps?.startTime}`}
                onClick={() => props.eventClick({ event: calendarEvent })}
              >
                {props.eventContent({
                  event: calendarEvent,
                  timeText: String(event.extendedProps?.startTime),
                })}
              </button>
            </li>
          )
        })}
    </ul>
  ),
}))

const trialClassroom = {
  id: 2,
  name: 'Trial Sat',
  category: 'trial',
  ageGroup: '6-8 Years Old',
  programLevel: 'Coder Foundation',
  teacherId: 1,
  status: 'active',
  notes: null,
  archivedAt: null,
}
const saturdaySlot = {
  id: 300,
  teacherId: 1,
  classroomId: 2,
  title: 'Trial Sat',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 6,
  scheduledDate: null,
  startTime: '10:00',
  endTime: '11:00',
  startRecur: '2026-09-01',
  endRecur: null,
  status: 'active',
  notes: null,
}
const jane = {
  id: 7,
  fullName: 'Jane Tan',
  phone: '+60 12-345 6789',
  source: 'referral',
  status: 'new',
  children: [{ name: 'Ethan', age: 9, phone: null }],
  notes: null,
  followUps: [],
  tasks: [],
  convertedStudentId: null,
  addedDate: '2026-09-01',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'user-1', username: 'user', fullName: 'Jia Hui', role: mocks.role, isActive: true },
  ],
  fetchLeadsFromSupabase: async () => [jane],
  fetchClassroomsFromSupabase: async () => [trialClassroom],
  // The trial booking's student_id links to this - a real (lightweight)
  // students row is how attendance can be taken for a trial-booked child.
  fetchStudentsFromSupabase: async () => [
    {
      id: 501,
      teacherId: 1,
      classroomId: null,
      name: 'Aiden',
      phone: '+60 12-222 2222',
      age: 9,
      remainingHours: 0,
      lessonExpiryDate: '2026-09-26',
      accountFeeExpiryDate: '2026-09-26',
      miraiClubExpiryDate: '2026-09-26',
      notes: null,
      isActive: true,
      studentType: 'trial',
    },
  ],
  fetchSchedulesFromSupabase: async () => [
    saturdaySlot,
    { ...saturdaySlot, id: 301, startTime: '14:00', endTime: '15:00' },
  ],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [
    {
      id: 5,
      scheduleId: 300,
      bookingDate: '2026-09-26',
      leadId: 7,
      studentId: 501,
      childName: 'Aiden',
      childAge: 9,
      phone: '+60 12-222 2222',
      notes: null,
    },
  ],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityFromSupabase: async () => [],
  fetchLatestLessonLogStudents: mocks.latestLessonLog,
}))

async function signIn(role: 'admin' | 'teacher' = 'admin') {
  mocks.role = role
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'user-1' } }))
  await screen.findByRole('list', { name: 'calendar events' })
}

const slot = (time: string) => screen.getByRole('button', { name: `slot ${time}` })

describe('trial slots on the calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: 1, error: null })
    mocks.latestLessonLog.mockResolvedValue({ summary: null, students: [], reviews: [] })
  })

  it('shows a slot with nobody booked as Available and one with children as booked', async () => {
    await signIn()

    expect(within(slot('14:00')).getByText('Available')).toBeInTheDocument()
    expect(within(slot('10:00')).getByText('1 booked')).toBeInTheDocument()
    expect(within(slot('10:00')).getByText('Aiden')).toBeInTheDocument()
    expect(within(slot('10:00')).queryByText('Available')).not.toBeInTheDocument()
  })

  it('opens the bookings of the clicked slot and day', async () => {
    await signIn()

    await userEvent.click(slot('10:00'))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Trial slot')).toBeInTheDocument()
    expect(dialog.getByText(/2026-09-26 · 10:00-11:00 · Jia Hui/)).toBeInTheDocument()
    expect(dialog.getByText('1 booked')).toBeInTheDocument()
  })

  it('books a new person into an available slot and refreshes the calendar', async () => {
    await signIn()

    await userEvent.click(slot('14:00'))
    await userEvent.type(screen.getByLabelText('Child Name'), 'Zoe')
    await userEvent.type(screen.getByLabelText('Age'), '8')
    await userEvent.type(screen.getByLabelText('Phone'), '+60 11-999 8888')
    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('book_trial_slot', {
        p_schedule_id: 301,
        p_booking_date: '2026-09-26',
        p_child_name: 'Zoe',
        p_child_age: 8,
        p_phone: '+60 11-999 8888',
        p_lead_id: null,
        p_notes: null,
      }),
    )
  })

  it('books a child from an existing lead against that lead', async () => {
    await signIn()

    await userEvent.click(slot('14:00'))
    await userEvent.type(screen.getByPlaceholderText(/Parent name/), 'jane')
    await userEvent.click(screen.getByRole('button', { name: /Jane Tan/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        'book_trial_slot',
        expect.objectContaining({
          p_schedule_id: 301,
          p_child_name: 'Ethan',
          p_child_age: 9,
          p_lead_id: 7,
        }),
      ),
    )
  })

  it('shows the database message when a booking is refused', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      // Supabase returns plain objects, not Error instances.
      error: { code: 'P0001', message: 'This child is already booked for that trial slot.' },
    })
    await signIn()

    await userEvent.click(slot('14:00'))
    await userEvent.type(screen.getByLabelText('Child Name'), 'Aiden')
    await userEvent.type(screen.getByLabelText('Age'), '9')
    await userEvent.type(screen.getByLabelText('Phone'), '+60 12-222 2222')
    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This child is already booked for that trial slot.',
    )
  })

  it('removes a booking after confirming', async () => {
    await signIn()

    await userEvent.click(slot('10:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('cancel_trial_booking', { p_booking_id: 5 }),
    )
  })

  it('leads to cancelling just this day through Edit Slot', async () => {
    await signIn()

    await userEvent.click(slot('14:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Edit Slot / Cancel This Day' }))

    expect(await screen.findByRole('button', { name: 'Cancel This Day' })).toBeInTheDocument()
    expect(screen.queryByText('Trial slot')).not.toBeInTheDocument()
  })

  it('routes a teacher straight into attendance for a booked trial slot, same as any other class', async () => {
    await signIn('teacher')

    await userEvent.click(slot('10:00'))

    // The booking-management modal never opens for a teacher - they land
    // directly on the same attendance flow every other class type uses,
    // with the booked child as the roster (via trial_bookings.student_id).
    expect(screen.queryByText('Trial slot')).not.toBeInTheDocument()
    expect(await screen.findByText('Attendance Submission')).toBeInTheDocument()
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Aiden')).toBeInTheDocument()
    // Age and phone (known from the booking) replace the meaningless
    // "Student ID #..." a teacher has no use for.
    expect(dialog.getByText('9 yrs old · +60 12-222 2222')).toBeInTheDocument()
    expect(dialog.queryByText(/Student ID/)).not.toBeInTheDocument()
    expect(mocks.latestLessonLog).toHaveBeenCalledWith(300, '2026-09-26')
  })

  it('lets an admin reach the same attendance flow from Take Attendance', async () => {
    await signIn()

    await userEvent.click(slot('10:00'))
    await screen.findByText('Trial slot')
    await userEvent.click(screen.getByRole('button', { name: 'Take Attendance' }))

    expect(screen.queryByText('Trial slot')).not.toBeInTheDocument()
    expect(await screen.findByText('Attendance Submission')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('Aiden')).toBeInTheDocument()
  })

  it('does not offer Take Attendance for an empty (unbooked) trial slot', async () => {
    await signIn()

    await userEvent.click(slot('14:00'))
    await screen.findByText('Trial slot')

    expect(screen.queryByRole('button', { name: 'Take Attendance' })).not.toBeInTheDocument()
  })

  it('submits trial attendance through the unmodified point-name RPC, keyed to the booked student', async () => {
    await signIn('teacher')

    await userEvent.click(slot('10:00'))
    await screen.findByText('Attendance Submission')

    // Marking Aiden absent skips the score/remark review entirely, so this
    // exercises the submit path without needing star-rating interactions.
    await userEvent.click(screen.getByRole('button', { name: 'Absent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit Attendance' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('submit_lesson_attendance', {
        p_schedule_id: 300,
        p_occurrence_date: '2026-09-26',
        p_lesson_remark: null,
        p_attendance: [{ student_id: 501, status: 'absent' }],
        p_student_reviews: [],
      }),
    )
  })
})
