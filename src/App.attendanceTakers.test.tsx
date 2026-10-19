import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openMenu } from './test/openMenu'

// Besides admin and the class teacher, the class's other teachers (assistants)
// and a day's substitute take attendance; the school can switch either off.

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  takers: vi.fn(),
  saveSubstitute: vi.fn(),
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
    rpc: vi.fn(async () => ({ data: null, error: null })),
  },
}))

vi.mock('./lib/attendanceTakers', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAttendanceTakers: () => mocks.takers(),
  saveLessonSubstitute: (...args: unknown[]) => mocks.saveSubstitute(...args),
}))

// Lists the events App built. A covered day is a one-day series, clicked on
// its own day; the weekly class is clicked on Wed Sep 16.
vi.mock('@fullcalendar/react', () => ({
  default: (props: {
    events: { id: string; title: string; start?: string; rrule?: { dtstart?: string }; extendedProps?: Record<string, unknown> }[]
    eventClick: (arg: unknown) => void
  }) => (
    <ul aria-label="calendar events">
      {props.events
        .filter((event) => event.extendedProps?.scheduleId !== undefined)
        .map((event) => {
          const start = new Date(event.id.includes('-cover-') ? (event.rrule?.dtstart as string) : '2026-09-16T19:30:00')
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => props.eventClick({ event: { title: event.title, start, extendedProps: event.extendedProps } })}
              >
                {event.title}
              </button>
            </li>
          )
        })}
    </ul>
  ),
}))

function account(id: number, authUserId: string, fullName: string, role: 'admin' | 'teacher') {
  return { id, authUserId, username: fullName.toLowerCase(), fullName, role, isActive: true, permissions: {} }
}

// Jia Hui teaches the class, Zen Ho assists, Mei covers Sep 16.
const teachers = [
  account(1, 'admin-1', 'Admin', 'admin'),
  account(2, 'teacher-2', 'Jia Hui', 'teacher'),
  account(3, 'teacher-3', 'Zen Ho', 'teacher'),
  account(4, 'teacher-4', 'Mei', 'teacher'),
]

const classroom = {
  id: 1,
  name: 'WED Coding',
  category: 'regular',
  ageGroup: '6-8 Years Old',
  programLevel: 'Coder Foundation',
  teacherId: 2,
  teacherIds: [2, 3],
  status: 'active',
  notes: null,
  archivedAt: null,
}

const weekly = {
  id: 10,
  teacherId: 2,
  classroomId: 1,
  title: 'WED Coding',
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

const ada = {
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
}

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => teachers,
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [classroom],
  fetchStudentsFromSupabase: async () => [ada],
  fetchSchedulesFromSupabase: async () => [weekly],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchMakeupPlansFromSupabase: async () => [],
  fetchLeadOptionsFromSupabase: async () => [],
  fetchPackagesFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchLatestLessonLogStudents: async () => ({ summary: null, students: [], reviews: [] }),
  fetchAdminActivityForDay: async () => [],
}))

const covered = { scheduleId: 10, lessonDate: '2026-09-16', teacherId: 4 }

async function openClassAs(userId: string) {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: userId } }))
  await openMenu('Calendar')
  const events = await screen.findByRole('list', { name: 'calendar events' })
  return within(events)
}

describe('who takes attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.takers.mockResolvedValue({ rules: { assistants: true, substitutes: true }, substitutes: [covered] })
    mocks.saveSubstitute.mockResolvedValue(null)
  })

  it("the class's assistant sees the class and takes its attendance", async () => {
    const events = await openClassAs('teacher-3')
    await userEvent.click(await events.findByRole('button', { name: 'WED Coding' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Attendance Submission')).toBeInTheDocument()
    expect(within(dialog).getByText('You assist this class')).toBeInTheDocument()
  })

  it('with assistants switched off, the assistant can only look', async () => {
    mocks.takers.mockResolvedValue({ rules: { assistants: false, substitutes: true }, substitutes: [] })
    const events = await openClassAs('teacher-3')
    await userEvent.click(await events.findByRole('button', { name: 'WED Coding' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Class Roster')).toBeInTheDocument()
    expect(within(dialog).getByText(/attendance is taken by the class's teachers/)).toBeInTheDocument()
  })

  it('the substitute sees only the day they cover, and takes its attendance', async () => {
    const events = await openClassAs('teacher-4')
    // One card: Sep 16, not the weekly class.
    expect(await events.findAllByRole('button', { name: 'WED Coding' })).toHaveLength(1)
    await userEvent.click(events.getByRole('button', { name: 'WED Coding' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Attendance Submission')).toBeInTheDocument()
    expect(within(dialog).getByText('You are covering this class')).toBeInTheDocument()
  })

  it('a teacher with no part in the class does not see it', async () => {
    mocks.takers.mockResolvedValue({ rules: { assistants: true, substitutes: true }, substitutes: [] })
    const events = await openClassAs('teacher-4')
    expect(events.queryByRole('button', { name: 'WED Coding' })).not.toBeInTheDocument()
  })

  it("admin picks the day's substitute where they edit that day of the timetable", async () => {
    mocks.takers.mockResolvedValue({ rules: { assistants: true, substitutes: true }, substitutes: [] })
    const events = await openClassAs('admin-1')
    await userEvent.click(await events.findByRole('button', { name: 'WED Coding' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Substitute teacher for 2026-09-16')).toBeInTheDocument()
    const picker = within(dialog).getByLabelText('Substitute teacher')
    // The class's own teacher needs no substitute.
    expect(within(picker).queryByRole('option', { name: 'Jia Hui' })).not.toBeInTheDocument()
    await userEvent.selectOptions(picker, 'Mei')

    expect(mocks.saveSubstitute).toHaveBeenCalledWith(10, '2026-09-16', 4)
    expect(await within(dialog).findByLabelText('Substitute teacher')).toHaveValue('4')
  })

  it('loads the page as before when the substitutes table is not there yet', async () => {
    mocks.takers.mockRejectedValue(new Error('relation "lesson_substitutes" does not exist'))
    const events = await openClassAs('teacher-2')

    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument()
    await userEvent.click(await events.findByRole('button', { name: 'WED Coding' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Attendance Submission')).toBeInTheDocument()
  })

  it('no substitute picker when the school does not use substitutes', async () => {
    mocks.takers.mockResolvedValue({ rules: { assistants: true, substitutes: false }, substitutes: [] })
    const events = await openClassAs('admin-1')
    await userEvent.click(await events.findByRole('button', { name: 'WED Coding' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Substitute teacher')).not.toBeInTheDocument()
  })
})
