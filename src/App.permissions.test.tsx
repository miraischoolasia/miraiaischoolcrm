import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getTodayString } from './domain/studentStatus'
import type { AccountPermissions, TeacherRole } from './types/domain'
import { openMenu } from './test/openMenu'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  account: { role: 'staff', permissions: {} } as { role: string; permissions: object },
  activityForDay: vi.fn(async () => [] as unknown[]),
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
    from: () => ({ insert: vi.fn() }),
    rpc: vi.fn(),
  },
}))
vi.mock('@fullcalendar/react', () => ({ default: () => <div>Calendar ready</div> }))
vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    {
      id: 4,
      authUserId: 'user-4',
      username: 'desk',
      fullName: 'Front Desk',
      isActive: true,
      ...mocks.account,
    },
  ],
  fetchLeadsFromSupabase: async () => [
    {
      id: 900,
      fullName: 'Parent',
      phone: '0123456789',
      sourceId: null,
      picId: null,
      tagIds: [],
      checks: {},
      status: 'new',
      children: [],
      notes: null,
      followUps: [],
      tasks: [],
      convertedStudentId: null,
      addedDate: new Date().toISOString().slice(0, 10),
      createdAt: '',
      updatedAt: '',
    },
  ],
  fetchClassroomsFromSupabase: async () => [],
  fetchStudentsFromSupabase: async () => [],
  fetchSchedulesFromSupabase: async () => [],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchMakeupPlansFromSupabase: async () => [],
  fetchLeadOptionsFromSupabase: async () => [],
  fetchPackagesFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityForDay: mocks.activityForDay,
}))

async function signInAs(role: TeacherRole, permissions: AccountPermissions) {
  mocks.account = { role, permissions }
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'user-4' } }))
  await screen.findByText(/Workspace$/)
}

// The menu's top level: Today and the group headings (not the pages inside a group).
const navLabels = () =>
  Array.from(document.querySelectorAll('aside nav > button, aside nav > div > button[aria-expanded]')).map(
    (button) => button.textContent,
  )

// Every page in the side menu, with each group opened.
async function menuPages() {
  const nav = within(document.querySelector('aside nav') as HTMLElement)
  for (const group of nav.queryAllByRole('button', { expanded: false })) {
    await userEvent.click(group)
  }
  return nav
    .getAllByRole('button')
    .filter((button) => !button.hasAttribute('aria-expanded'))
    .map((button) => button.textContent)
}

describe('account permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a staff account with nothing ticked a note instead of any module', async () => {
    await signInAs('staff', {})

    expect(screen.getByText('Staff Workspace')).toBeInTheDocument()
    expect(await screen.findByText(/no modules yet/)).toBeInTheDocument()
    expect(screen.queryByText('Calendar ready')).not.toBeInTheDocument()
  })

  it('shows only the ticked modules, and leads without edit are view-only', async () => {
    await signInAs('staff', { leads: { level: 'view' }, activity: { level: 'view' } })

    // Everybody starts on Today; Leads sits in Marketing, the log in Admin.
    expect(navLabels()).toEqual(['Today', 'Marketing', 'Admin'])
    await openMenu(/^Leads$/)
    expect((await screen.findAllByRole('button', { name: 'View' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Add Lead/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete lead' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Convert/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('combobox').some((box) => box.hasAttribute('disabled'))).toBe(true)

    await userEvent.click(screen.getAllByRole('button', { name: 'View' })[0])
    expect(await screen.findByText(/View only - your account cannot change leads/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save Details' })).not.toBeInTheDocument()
  })

  it('gives edit without delete: add and convert need their ticks', async () => {
    await signInAs('staff', { leads: { level: 'edit' } })
    await openMenu(/^Leads$/)

    expect(await screen.findByRole('button', { name: /Add Lead/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete lead' })).not.toBeInTheDocument()
    // Converting creates a student, which needs Students edit too.
    expect(screen.queryByRole('button', { name: /Convert/ })).not.toBeInTheDocument()
  })

  it('keeps a plain teacher on Today and Teaching (Calendar, My Classroom, Class Videos, Question Bank), starting on Today', async () => {
    await signInAs('teacher', {})

    expect(await screen.findByText(/^Good (morning|afternoon|evening),/)).toBeInTheDocument()
    expect(screen.queryByText('Calendar ready')).not.toBeInTheDocument()
    expect(navLabels()).toEqual(['Today', 'Teaching'])
    expect(await menuPages()).toEqual(['Today', 'Calendar', 'My Classroom', 'Class Videos', 'Question Bank'])
  })

  it('shows a teacher their own day first, with a way on to the full calendar', async () => {
    await signInAs('teacher', {})

    expect(await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening),/ })).toBeInTheDocument()
    expect(screen.getByText('No classes today.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open full calendar' }))
    expect(await screen.findByText('Calendar ready')).toBeInTheDocument()
  })

  it('starts an admin on Today, with the full calendar one click away', async () => {
    await signInAs('admin', {})

    expect(await screen.findByRole('heading', { name: /^Good (morning|afternoon|evening),/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Classes today' })).toBeInTheDocument()
    expect(screen.queryByText('Calendar ready')).not.toBeInTheDocument()
    expect(navLabels()[0]).toBe('Today')

    await userEvent.click(screen.getByRole('button', { name: 'Open full calendar' }))
    expect(await screen.findByText('Calendar ready')).toBeInTheDocument()
  })

  it('gives a staff account only the Today blocks it has ticked', async () => {
    await signInAs('staff', { leads: { level: 'view' } })

    expect(await screen.findByRole('region', { name: 'Leads' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Classes today' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Students to follow up' })).not.toBeInTheDocument()
  })

  it('adds the ticked modules to a teacher account', async () => {
    await signInAs('teacher', { leads: { level: 'edit', delete: true } })

    expect(navLabels()).toEqual(['Today', 'Marketing', 'Teaching'])
  })

  it('loads the activity log only when it is opened, one day at a time', async () => {
    await signInAs('staff', { activity: { level: 'view' }, leads: { level: 'view' } })
    expect(mocks.activityForDay).not.toHaveBeenCalled()

    await openMenu('Activity Log')

    expect(await screen.findByRole('heading', { name: /Today/ })).toBeInTheDocument()
    expect(mocks.activityForDay).toHaveBeenCalledTimes(1)
    expect(mocks.activityForDay).toHaveBeenCalledWith(getTodayString())
  })
})
