import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openMenu } from './test/openMenu'

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
  // Everybody starts on Today.
  await openMenu('Timetable')
  await screen.findByRole('list', { name: 'calendar events' })
}

describe('calendar filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    window.localStorage.clear()
  })

  const shown = () => within(screen.getByRole('list', { name: 'calendar events' })).queryAllByRole('listitem').map((item) => item.textContent)

  async function pickPeople(...names: string[]) {
    await userEvent.click(screen.getByRole('button', { name: /^People:/ }))
    const picker = screen.getByRole('dialog', { name: 'Pick people' })
    for (const name of names) await userEvent.click(within(picker).getByLabelText(name))
    await userEvent.keyboard('{Escape}')
  }

  it("shows every teacher's classes by default, and offers the people and team filters to an admin", async () => {
    await signIn()
    expect(shown()).toEqual(['Jia Hui Coding', 'Zen Ho Coding'])
    expect(screen.getByRole('button', { name: 'People: Everyone' })).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by team')).toBeInTheDocument()
  })

  it('narrows the calendar to one or several people, and "Only mine" to the signed-in person', async () => {
    await signIn()
    await pickPeople('Jia Hui')
    expect(shown()).toEqual(['Jia Hui Coding'])

    await pickPeople('Zen Ho')
    expect(shown()).toEqual(['Jia Hui Coding', 'Zen Ho Coding'])

    // The admin teaches no class here.
    await userEvent.click(screen.getByRole('button', { name: 'Only mine' }))
    await waitFor(() => expect(shown()).toEqual([]))

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(shown()).toEqual(['Jia Hui Coding', 'Zen Ho Coding']))
  })

  it('remembers the filters for next time', async () => {
    const { unmount } = await signInAndKeep()
    await pickPeople('Zen Ho')
    expect(shown()).toEqual(['Zen Ho Coding'])
    unmount()

    await signIn()
    expect(shown()).toEqual(['Zen Ho Coding'])
  })

  it('starts a teacher on their own classes, with no people or team to pick', async () => {
    await signIn('teacher')
    expect(screen.getByRole('button', { name: 'Only mine' })).toHaveAttribute('aria-pressed', 'true')
    expect(shown()).toEqual(['Jia Hui Coding'])
    expect(screen.queryByRole('button', { name: /^People:/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by team')).not.toBeInTheDocument()
  })
})

async function signInAndKeep() {
  const view = render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await openMenu('Timetable')
  await screen.findByRole('list', { name: 'calendar events' })
  return view
}

describe('sidebar navigation order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('lists Today, then the Marketing, Media, My Course, Students and Admin categories for an admin', async () => {
    await signIn()

    const topLevel = document.querySelectorAll('aside nav > button')
    expect(Array.from(topLevel).map((button) => button.textContent?.replace(/\d+$/, ''))).toEqual([
      'Today',
      'Marketing',
      'Media',
      'My Course',
      'Students',
      'Admin',
    ])
  })

  it('keeps the pages out of the side menu: a category opens its first page, with its pages as tabs on top', async () => {
    // Scoped to the desktop sidebar - the phone's bottom bar is a second
    // menu (hidden only by a CSS media query jsdom does not apply).
    await signIn()
    const nav = within(document.querySelector('aside nav')!)

    expect(nav.queryByRole('button', { name: 'Leads' })).not.toBeInTheDocument()
    expect(nav.queryByRole('button', { name: 'Form' })).not.toBeInTheDocument()

    await userEvent.click(nav.getByRole('button', { name: /Marketing/ }))

    const tabs = within(screen.getByRole('navigation', { name: 'Marketing pages' }))
    expect(tabs.getByRole('button', { name: 'Leads' })).toHaveAttribute('aria-current', 'page')
    expect(tabs.getByRole('button', { name: /Form/ })).toBeInTheDocument()
  })
})
