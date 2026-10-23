import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getTodayString } from './domain/studentStatus'
import { addMonths } from './lib/packages'
import { openMenu } from './test/openMenu'

// An HOA student becomes a regular student in one step, on the same student.

const today = getTodayString()

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
vi.mock('@fullcalendar/react', () => ({ default: () => <div>Calendar ready</div> }))

const hoa = {
  id: 32,
  teacherId: null,
  classroomId: null,
  name: 'Ava Tan',
  phone: null,
  age: 8,
  remainingHours: 0,
  lessonExpiryDate: '2026-09-01',
  accountFeeExpiryDate: '2026-09-01',
  miraiClubExpiryDate: '2026-09-01',
  notes: null,
  isActive: true,
  studentType: 'trial',
  packageId: null,
}

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', isActive: true, permissions: {} },
  ],
  fetchStudentsFromSupabase: async () => [hoa],
  fetchPackagesFromSupabase: async () => [
    { id: 3, name: '6 Months', kind: 'regular', classCount: 24, durationMonths: 6, includesFees: true, isActive: true, sortOrder: 1 },
  ],
  fetchStudentEnrollments: async () => [],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [
    { id: 5, name: 'WED C002', category: 'regular', ageGroup: '6-8 Years Old', programLevel: 'Coder Foundation', teacherId: 1, status: 'active', notes: null, archivedAt: null },
    { id: 9, name: 'HOA Saturday', category: 'trial', ageGroup: '6-8 Years Old', programLevel: 'Coder Foundation', teacherId: 1, status: 'active', notes: null, archivedAt: null },
  ],
  fetchSchedulesFromSupabase: async () => [],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchMakeupPlansFromSupabase: async () => [],
  fetchLeadOptionsFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityForDay: async () => [],
  fetchStudentAttendanceRows: async () => [],
}))

async function openStudentList() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await openMenu('Timetable')
  await screen.findByText('Calendar ready')
  await openMenu('Student List')
}

describe('converting an HOA student to a regular student', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: 32, error: null })
  })

  it('converts the same student from the list: class, package and a new fee year in one call', async () => {
    await openStudentList()
    await userEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'More actions for Ava Tan' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Convert to Regular' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Convert Ava Tan to a regular student')).toBeInTheDocument()
    // Only classes the child can join, not HOA classes.
    expect(dialog.queryByRole('option', { name: /HOA Saturday/ })).not.toBeInTheDocument()
    await userEvent.selectOptions(dialog.getByLabelText('Class'), '5')
    await userEvent.selectOptions(dialog.getByLabelText('Package'), '3')
    await userEvent.click(dialog.getByRole('button', { name: 'Convert to Regular' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('convert_hoa_student', {
        p_student_id: 32,
        p_classroom_id: 5,
        p_start_date: today,
        p_package_id: 3,
        p_class_count: 24,
        p_lesson_expiry_date: addMonths(today, 6),
        p_account_fee_expiry_date: addMonths(today, 12),
        p_mirai_club_expiry_date: addMonths(today, 12),
        p_months: null,
        p_lead_id: null,
      }),
    )
    // No second student is made, and no separate enrolment.
    expect(mocks.rpc).not.toHaveBeenCalledWith('create_student_record', expect.anything())
    expect(mocks.rpc).not.toHaveBeenCalledWith('enroll_student_package', expect.anything())
  })
})
