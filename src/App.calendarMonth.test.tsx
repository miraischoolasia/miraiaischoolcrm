import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { openMenu } from './test/openMenu'

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  rpc: vi.fn(),
  // The view FullCalendar reports it shows.
  view: 'dayGridMonth',
  // Class Settings > Calendar: the weekly classes on the month too.
  monthWeekly: false,
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

type StandInEvent = { id: string; title: string; start?: string; extendedProps?: Record<string, unknown> }
type StandInProps = {
  events: StandInEvent[]
  datesSet?: (arg: { view: { type: string } }) => void
  eventContent: (arg: unknown) => ReactNode
  eventClick: (arg: unknown) => void
  dayCellContent?: (arg: unknown) => ReactNode
}

// FullCalendar's stand-in: says which view it shows, draws each event with the app's own card, and draws two
// days of October (Mon 12th, which has a cancelled class, and Tue 20th, which has nothing).
function StandInCalendar(props: StandInProps) {
  const { datesSet } = props
  useEffect(() => {
    datesSet?.({ view: { type: mocks.view } })
  }, [datesSet])
  const view = { type: mocks.view }
  const asEvent = (event: StandInEvent) => {
    const [date = '2026-10-01', time = '00:00'] = (event.start ?? '').split('T')
    const [year, month, day] = date.split('-').map(Number)
    const [hours, minutes] = time.split(':').map(Number)
    return { title: event.title, start: new Date(year, month - 1, day, hours, minutes), extendedProps: event.extendedProps ?? {} }
  }
  return (
    <div>
      <ul aria-label="calendar events">
        {props.events.map((event) => (
          <li key={event.id} data-event-id={event.id}>
            <button type="button" onClick={() => props.eventClick({ event: asEvent(event), view })}>
              {props.eventContent({ event: asEvent(event), view, timeText: '' })}
            </button>
          </li>
        ))}
      </ul>
      {[12, 20].map((day) => (
        <div key={day} data-testid={`day-${day}`}>
          {props.dayCellContent?.({ date: new Date(2026, 9, day), dayNumberText: String(day), isOther: false, view })}
        </div>
      ))}
    </div>
  )
}

vi.mock('@fullcalendar/react', () => ({ default: StandInCalendar }))

const regular = {
  id: 101,
  teacherId: 1,
  classroomId: 1,
  title: 'F2 Bahasa',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 1,
  scheduledDate: null,
  startTime: '19:00',
  endTime: '20:15',
  startRecur: '2026-10-01',
  endRecur: null,
  status: 'active',
  notes: null,
}
const oneOff = (id: number, date: string, title: string) => ({
  ...regular,
  id,
  classroomId: null,
  title,
  eventType: 'replacement',
  recurrenceType: 'none',
  dayOfWeek: null,
  scheduledDate: date,
  startRecur: null,
})

vi.mock('./lib/calendarLayout', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchMonthWeekly: async () => mocks.monthWeekly,
}))

vi.mock('./lib/subjects', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchSubjects: async () => [{ id: 7, name: 'BIK', sortOrder: 1, isActive: true }],
}))

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Ms Rachel', role: 'admin', isActive: true, permissions: {} },
  ],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [
    {
      id: 1,
      name: 'F2 Bahasa',
      category: 'regular',
      ageGroup: 'Form 2',
      programLevel: 'Regular',
      teacherId: 1,
      status: 'active',
      notes: null,
      archivedAt: null,
      subjectId: 7,
    },
  ],
  fetchStudentsFromSupabase: async () => [
    {
      id: 501,
      teacherId: 1,
      classroomId: 1,
      name: 'Kid One',
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
  ],
  fetchSchedulesFromSupabase: async () => [
    regular,
    oneOff(201, '2026-10-14', 'F2 Bahasa Makeup'),
    oneOff(202, '2026-10-21', 'Extra Maths'),
  ],
  fetchScheduleParticipantsFromSupabase: async () => [{ id: 1, scheduleId: 202, studentId: 501, isActive: true }],
  fetchScheduleExceptionsFromSupabase: async () => [
    { id: 1, scheduleId: 101, exceptionDate: '2026-10-12', reason: 'Teacher away', movedToScheduleId: null, replacementScheduleId: 201 },
    { id: 2, scheduleId: 101, exceptionDate: '2026-10-19', reason: null, movedToScheduleId: null, replacementScheduleId: null },
  ],
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
  await openMenu('Calendar')
}

const card = (id: string) => document.querySelector(`[data-event-id="${id}"]`) as HTMLElement | null

describe('the month calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    mocks.view = 'dayGridMonth'
    mocks.monthWeekly = false
    window.localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 19, 10, 0) })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows only the cancelled days, replacement and extra classes, each as time, grade and subject, and teacher', async () => {
    await signInAndOpenCalendar()
    await screen.findByRole('list', { name: 'calendar events' })

    await vi.waitFor(() => expect(card('schedule-101-cancelled-2026-10-12')).not.toBeNull())
    expect(card('schedule-101')).toBeNull()

    const cancelled = card('schedule-101-cancelled-2026-10-12')!
    expect(cancelled).toHaveTextContent('7.00–8.15PM')
    expect(cancelled).toHaveTextContent('F2 BIK Ms Rachel')
    expect(within(cancelled).getByRole('img', { name: 'Replacement: Wed 14 Oct, 7.00–8.15PM' })).toBeInTheDocument()
    expect(within(card('schedule-101-cancelled-2026-10-19')!).getByRole('img', { name: 'No replacement yet' })).toBeInTheDocument()

    expect(card('schedule-201')!.querySelector('[data-special-kind]')).toHaveAttribute('data-special-kind', 'replacement')
    expect(card('schedule-201')).toHaveTextContent('F2 BIK Ms Rachel')
    expect(card('schedule-202')!.querySelector('[data-special-kind]')).toHaveAttribute('data-special-kind', 'extra')
    expect(card('schedule-202')).toHaveTextContent('Extra Maths Ms Rachel')

    // Every day of the month carries the "nothing on" note; the page's styles show it only on a day without a card.
    expect(screen.getByTestId('day-20')).toHaveTextContent('No class event scheduled.')
  })

  it('opens the cancelled day (restore or add a replacement) and an extra class (its class window)', async () => {
    await signInAndOpenCalendar()
    await vi.waitFor(() => expect(card('schedule-101-cancelled-2026-10-19')).not.toBeNull())

    await userEvent.click(within(card('schedule-101-cancelled-2026-10-19')!).getByRole('button'))
    const cancelledWindow = await screen.findByRole('dialog')
    expect(within(cancelledWindow).getByRole('button', { name: 'Add Replacement Class' })).toBeInTheDocument()
    expect(within(cancelledWindow).getByRole('button', { name: 'Restore This Day' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(within(card('schedule-202')!).getByRole('button'))
    const lessonWindow = await screen.findByRole('dialog')
    expect(within(lessonWindow).getByRole('heading', { name: 'Extra Maths' })).toBeInTheDocument()
    // Its details; attendance opens in the same window once the day comes.
    expect(lessonWindow).toHaveTextContent('Ms Rachel')
    expect(lessonWindow).toHaveTextContent('1 on the list')
  })

  it('also shows the weekly class, faded and after the special days, when the school turns that on', async () => {
    mocks.monthWeekly = true
    await signInAndOpenCalendar()
    await vi.waitFor(() => expect(card('schedule-101')).not.toBeNull())

    const weekly = card('schedule-101')!
    expect(weekly.querySelector('[data-special-kind]')).toHaveAttribute('data-special-kind', 'weekly')
    expect(weekly).toHaveTextContent('7.00–8.15PM')
    expect(weekly).toHaveTextContent('F2 BIK Ms Rachel')
    // The special days are still there.
    expect(card('schedule-101-cancelled-2026-10-12')).not.toBeNull()
    expect(card('schedule-202')).not.toBeNull()
  })

  it('leaves the week view with every class', async () => {
    mocks.view = 'timeGridWeek'
    await signInAndOpenCalendar()
    await vi.waitFor(() => expect(card('schedule-101')).not.toBeNull())
    expect(screen.getByTestId('day-20')).not.toHaveTextContent('No class event scheduled.')
  })
})
