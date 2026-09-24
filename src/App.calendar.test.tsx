import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  rpc: vi.fn(),
  exceptions: vi.fn(),
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
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', isActive: true },
  ],
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
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityFromSupabase: async () => [],
}))

async function signInAsAdmin() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await screen.findByRole('list', { name: 'calendar events' })
}

describe('calendar class-type filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exceptions.mockResolvedValue([])
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('shows everything, then narrows to regular, trial or replacement classes', async () => {
    await signInAsAdmin()
    const events = () => within(screen.getByRole('list', { name: 'calendar events' }))

    expect(events().getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Regular Coding',
      'Trial Coding',
      'Makeup Session',
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Trial Class' }))
    expect(events().getAllByRole('button').map((button) => button.textContent)).toEqual(['Trial Coding'])

    await userEvent.click(screen.getByRole('button', { name: 'Regular Class' }))
    expect(events().getAllByRole('button').map((button) => button.textContent)).toEqual(['Regular Coding'])

    await userEvent.click(screen.getByRole('button', { name: 'Replacement Class' }))
    expect(events().getAllByRole('button').map((button) => button.textContent)).toEqual(['Makeup Session'])

    await userEvent.click(screen.getByRole('button', { name: 'All Classes' }))
    expect(events().getAllByRole('button')).toHaveLength(3)
  })
})

describe('adding a class', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exceptions.mockResolvedValue([])
  })

  it('opens Add Class in Replacement mode, not Regular', async () => {
    // Regression: a useEffect keyed to isCreatingSchedule used to re-derive
    // the form from scratch right after Add Class opened it, always
    // resetting eventType back to 'regular' and silently turning every
    // replacement-class attempt into the wrong (classroom-linked) form.
    await signInAsAdmin()

    await userEvent.click(screen.getByRole('button', { name: 'Add Class' }))

    expect(await screen.findByText('New Replacement Class')).toBeInTheDocument()
    expect(screen.queryByText('New Weekly Timetable')).not.toBeInTheDocument()
  })

  it('still populates the form when editing an existing regular schedule', async () => {
    // The same effect also drives openEditSchedule (which sets nothing but
    // the id) - confirms narrowing its guard to editingSchedule only did not
    // break that path.
    await signInAsAdmin()

    await userEvent.click(screen.getByRole('button', { name: 'Regular Coding' }))

    expect(await screen.findByText('Edit timetable entry')).toBeInTheDocument()
    expect(screen.getByLabelText('Recurrence Start Date')).toHaveValue('2026-09-01')
  })
})

describe('cancelling a single class day', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.exceptions.mockResolvedValue([])
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('calls cancel_schedule_occurrence for the clicked day only, after confirming', async () => {
    await signInAsAdmin()

    await userEvent.click(screen.getByRole('button', { name: 'Regular Coding' }))
    await userEvent.type(screen.getByPlaceholderText(/Reason/), 'Public event')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel This Day' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('cancel_schedule_occurrence', {
        p_schedule_id: 10,
        p_occurrence_date: '2026-09-08',
        p_reason: 'Public event',
      }),
    )
    // Only the single-day RPC ran; the whole schedule was not cancelled.
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_admin_activity', expect.anything())
  })

  it('does nothing when the confirmation is declined', async () => {
    await signInAsAdmin()

    await userEvent.click(screen.getByRole('button', { name: 'Regular Coding' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel This Day' }))
    const dialogCancel = (await screen.findAllByRole('button', { name: 'Cancel' })).at(-1)!
    await userEvent.click(dialogCancel)

    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('offers Restore or Add Replacement Class when the cancelled card is clicked', async () => {
    mocks.exceptions.mockResolvedValue([
      { id: 1, scheduleId: 10, exceptionDate: '2026-09-08', reason: 'Public holiday' },
    ])
    await signInAsAdmin()

    await userEvent.click(screen.getByRole('button', { name: 'Regular Coding (cancelled)' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Regular Coding')).toBeInTheDocument()
    expect(dialog.getByText(/Reason: Public holiday/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Restore This Day' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Add Replacement Class' })).toBeInTheDocument()
  })

  it('restores a cancelled day via Restore This Day', async () => {
    mocks.exceptions.mockResolvedValue([
      { id: 1, scheduleId: 10, exceptionDate: '2026-09-08', reason: null },
    ])
    await signInAsAdmin()

    await userEvent.click(screen.getByRole('button', { name: 'Regular Coding (cancelled)' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Restore This Day' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('restore_schedule_occurrence', {
        p_schedule_id: 10,
        p_occurrence_date: '2026-09-08',
      }),
    )
  })

  it('prefills a replacement class from the cancelled day, with the active roster pre-checked', async () => {
    mocks.exceptions.mockResolvedValue([
      { id: 1, scheduleId: 10, exceptionDate: '2026-09-08', reason: null },
    ])
    await signInAsAdmin()

    await userEvent.click(screen.getByRole('button', { name: 'Regular Coding (cancelled)' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add Replacement Class' }))

    // The options modal is gone, replaced by the schedule modal.
    expect(screen.queryByText('Cancelled class')).not.toBeInTheDocument()
    expect(await screen.findByText('New Replacement Class')).toBeInTheDocument()
    expect(screen.getByLabelText('Class Title')).toHaveValue('Regular Coding Makeup')
    expect(screen.getByLabelText('Notes')).toHaveValue(
      'Makeup for Regular Coding (cancelled 2026-09-08).',
    )
    expect(screen.getByLabelText('Start Time')).toHaveValue('19:30')
    expect(screen.getByLabelText('End Time')).toHaveValue('21:30')
    expect(screen.getByRole('checkbox', { name: /Ada Lovelace/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Inactive Kid/ })).not.toBeChecked()
  })
})
