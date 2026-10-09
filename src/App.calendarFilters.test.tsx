import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
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
    rpc: mocks.rpc,
  },
}))

// A stand-in for FullCalendar that lists the events it was given, so the
// real teacher-filter wiring in App is exercised without a browser layout
// engine.
vi.mock('@fullcalendar/react', () => ({
  default: (props: {
    events: { id: string; title: string; extendedProps?: Record<string, unknown> }[]
  }) => (
    <ul aria-label="calendar events">
      {props.events
        .filter((event) => !event.extendedProps?.isHoliday)
        .map((event) => (
          <li key={event.id}>{event.title}</li>
        ))}
    </ul>
  ),
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
const teacherOne = {
  id: 2,
  authUserId: 'teacher-1',
  username: 'jiahui',
  fullName: 'Jia Hui',
  role: 'teacher',
  isActive: true,
  permissions: {},
}
const teacherTwo = {
  id: 3,
  authUserId: 'teacher-2',
  username: 'zenho',
  fullName: 'Zen Ho',
  role: 'teacher',
  isActive: true,
  permissions: {},
}

const classroomOne = {
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
const classroomTwo = { ...classroomOne, id: 2, name: 'Zen Ho Coding', teacherId: 3 }

const scheduleOne = {
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
const scheduleTwo = { ...scheduleOne, id: 11, teacherId: 3, classroomId: 2, title: 'Zen Ho Coding' }

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [admin, teacherOne, teacherTwo],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [classroomOne, classroomTwo],
  fetchStudentsFromSupabase: async () => [],
  fetchSchedulesFromSupabase: async () => [scheduleOne, scheduleTwo],
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

async function signIn(role: 'admin' | 'teacher' = 'admin') {
  const userId = role === 'admin' ? 'admin-1' : 'teacher-1'
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: userId } }))
  // A teacher starts on Today.
  if (role === 'teacher') {
    await userEvent.click((await screen.findAllByRole('button', { name: 'Calendar' }))[0])
  }
  await screen.findByRole('list', { name: 'calendar events' })
}

describe('calendar teacher filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('shows both classes by default, admin only', async () => {
    await signIn()
    const events = () => within(screen.getByRole('list', { name: 'calendar events' }))

    expect(events().getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Jia Hui Coding',
      'Zen Ho Coding',
    ])
    expect(screen.getByLabelText('Filter calendar by teacher')).toBeInTheDocument()
  })

  it('narrows the calendar to one teacher when selected', async () => {
    await signIn()
    const events = () => within(screen.getByRole('list', { name: 'calendar events' }))
    const select = screen.getByLabelText('Filter calendar by teacher')

    await userEvent.selectOptions(select, 'Jia Hui')
    expect(events().getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Jia Hui Coding',
    ])

    await userEvent.selectOptions(select, 'Zen Ho')
    expect(events().getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Zen Ho Coding',
    ])

    await userEvent.selectOptions(select, 'All Teachers')
    await waitFor(() =>
      expect(events().getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Jia Hui Coding',
        'Zen Ho Coding',
      ]),
    )
  })

  it('does not offer a teacher filter to a teacher (their calendar is already just their own)', async () => {
    await signIn('teacher')

    expect(screen.queryByLabelText('Filter calendar by teacher')).not.toBeInTheDocument()
  })
})

describe('sidebar navigation order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('places Calendar above the Marketing group for an admin', async () => {
    await signIn()

    const nav = document.querySelector('nav')
    expect(nav).not.toBeNull()
    const buttons = within(nav!).getAllByRole('button')
    const calendarIndex = buttons.findIndex((button) => button.textContent === 'Calendar')
    const marketingIndex = buttons.findIndex((button) => button.textContent?.includes('Marketing'))

    expect(calendarIndex).toBeGreaterThanOrEqual(0)
    expect(marketingIndex).toBeGreaterThanOrEqual(0)
    expect(calendarIndex).toBeLessThan(marketingIndex)
  })

  it('starts the Marketing group collapsed, opening only once clicked', async () => {
    // Scoped to the desktop sidebar <nav> specifically - the mobile bottom
    // bar (a second <nav>, hidden only by a CSS media query jsdom does not
    // apply) lists every item flat with no collapsible group at all.
    await signIn()
    const nav = within(document.querySelector('nav')!)

    expect(nav.queryByRole('button', { name: 'Leads' })).not.toBeInTheDocument()
    expect(nav.queryByRole('button', { name: 'Forms' })).not.toBeInTheDocument()

    await userEvent.click(nav.getByRole('button', { name: /Marketing/ }))

    expect(nav.getByRole('button', { name: 'Leads' })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: 'Forms' })).toBeInTheDocument()
  })
})
