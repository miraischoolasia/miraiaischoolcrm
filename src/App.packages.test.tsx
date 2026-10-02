import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getTodayString } from './domain/studentStatus'
import { addMonths } from './lib/packages'

const today = getTodayString()

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  rpc: vi.fn(),
  feeExpiry: '',
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
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
    rpc: mocks.rpc,
  },
}))
vi.mock('@fullcalendar/react', () => ({ default: () => <div>Calendar ready</div> }))

const pkg = (id: number, name: string, kind: string, classCount: number, months: number, fees: boolean) => ({
  id,
  name,
  kind,
  classCount,
  durationMonths: months,
  includesFees: fees,
  isActive: true,
  sortOrder: id,
})

vi.mock('./lib/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTeachersFromSupabase: async () => [
    { id: 1, authUserId: 'admin-1', username: 'admin', fullName: 'Admin', role: 'admin', isActive: true, permissions: {} },
  ],
  fetchStudentsFromSupabase: async () => [
    {
      id: 500,
      teacherId: null,
      classroomId: null,
      name: 'Ali',
      phone: null,
      age: null,
      remainingHours: 2,
      // The current package ends today, so a renewal starts today.
      lessonExpiryDate: today,
      accountFeeExpiryDate: mocks.feeExpiry,
      miraiClubExpiryDate: mocks.feeExpiry,
      notes: null,
      isActive: true,
      studentType: 'regular',
      packageId: 2,
    },
  ],
  fetchPackagesFromSupabase: async () => [
    pkg(1, 'Trial 1 Month', 'trial', 4, 1, false),
    pkg(2, '3 Months', 'regular', 12, 3, true),
    pkg(3, '6 Months', 'regular', 24, 6, true),
  ],
  fetchStudentEnrollments: async () => [],
  fetchLeadsFromSupabase: async () => [],
  fetchClassroomsFromSupabase: async () => [],
  fetchSchedulesFromSupabase: async () => [],
  fetchScheduleParticipantsFromSupabase: async () => [],
  fetchScheduleExceptionsFromSupabase: async () => [],
  fetchMakeupPlansFromSupabase: async () => [],
  fetchLeadOptionsFromSupabase: async () => [],
  fetchTrialBookingsFromSupabase: async () => [],
  fetchLessonLogSummariesFromSupabase: async () => [],
  fetchLessonLogStudentReviewsFromSupabase: async () => [],
  fetchAdminActivityFromSupabase: async () => [],
  fetchStudentAttendanceRows: async () => [],
}))

async function openRenewal() {
  render(<App />)
  await screen.findByText('Sign in to continue.')
  await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
  await screen.findByText('Calendar ready')
  await userEvent.click(screen.getAllByRole('button', { name: /^Students$/ })[0])
  await userEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: /Renew/ }))
  return within(await screen.findByRole('dialog'))
}

describe('renewing with a package', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({ data: 1, error: null })
  })

  it('fills in the classes and lesson date, then asks before extending the fee year', async () => {
    // Fees run out in a month; a 6-month package goes past that.
    mocks.feeExpiry = addMonths(today, 1)
    const dialog = await openRenewal()

    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Package' }), '3')
    expect(dialog.getByRole('spinbutton', { name: 'Add Classes' })).toHaveValue(24)
    expect(dialog.getByLabelText('New Lesson Expiry Date')).toHaveValue(addMonths(today, 6))
    expect(dialog.getByText(/goes past the Account Fee \/ Mirai Club year/)).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Save Renewal' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Update fees' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('enroll_student_package', {
        p_student_id: 500,
        p_package_id: 3,
        p_start_date: today,
        p_class_count: 24,
        p_lesson_expiry_date: addMonths(today, 6),
        // A year on from the old expiry, not from today.
        p_account_fee_expiry_date: addMonths(mocks.feeExpiry, 12),
        p_mirai_club_expiry_date: addMonths(mocks.feeExpiry, 12),
        p_remark: null,
      }),
    )
  })

  it('keeps the fees when the admin says so', async () => {
    mocks.feeExpiry = addMonths(today, 1)
    const dialog = await openRenewal()

    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Package' }), '2')
    await userEvent.click(dialog.getByRole('button', { name: 'Save Renewal' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Keep as they are' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        'enroll_student_package',
        expect.objectContaining({
          p_class_count: 12,
          p_account_fee_expiry_date: mocks.feeExpiry,
          p_mirai_club_expiry_date: mocks.feeExpiry,
        }),
      ),
    )
  })

  it('does not ask when the fee year already covers the package', async () => {
    mocks.feeExpiry = addMonths(today, 11)
    const dialog = await openRenewal()

    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Package' }), '2')
    expect(dialog.getByText(/already cover this package/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Save Renewal' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith('enroll_student_package', expect.anything()),
    )
    expect(screen.queryByRole('button', { name: 'Update fees' })).not.toBeInTheDocument()
  })

  it('still renews by hand without a package', async () => {
    mocks.feeExpiry = addMonths(today, 11)
    const dialog = await openRenewal()

    await userEvent.clear(dialog.getByRole('spinbutton', { name: 'Add Classes' }))
    await userEvent.type(dialog.getByRole('spinbutton', { name: 'Add Classes' }), '4')
    await userEvent.click(dialog.getByRole('button', { name: 'Save Renewal' }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        'renew_student_record',
        expect.objectContaining({ p_student_id: 500, p_add_hours: 4 }),
      ),
    )
  })
})

describe('adding a student with a package', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.feeExpiry = today
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'create_student_record'
        ? { data: [{ student_id: 777 }], error: null }
        : { data: 1, error: null },
    )
  })

  it('creates the student without classes, then enrolls them in the package', async () => {
    render(<App />)
    await screen.findByText('Sign in to continue.')
    await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
    await screen.findByText('Calendar ready')
    await userEvent.click(screen.getAllByRole('button', { name: /^Students$/ })[0])
    await userEvent.click(await screen.findByRole('button', { name: /Add Student/ }))
    const dialog = within(await screen.findByRole('dialog'))

    await userEvent.type(dialog.getByRole('textbox', { name: 'Student Full Name' }), 'Mei')
    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Package' }), '2')
    expect(dialog.getByText(/run for a year, to/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: /Create|Add Student/ }))

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        'enroll_student_package',
        expect.objectContaining({
          p_student_id: 777,
          p_package_id: 2,
          p_start_date: today,
          p_class_count: 12,
          p_lesson_expiry_date: addMonths(today, 3),
          p_account_fee_expiry_date: addMonths(today, 12),
        }),
      ),
    )
    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_student_record',
      expect.objectContaining({ p_full_name: 'Mei', p_initial_hours: 0 }),
    )
  })

  it('leaves the fees unpaid for a trial package', async () => {
    render(<App />)
    await screen.findByText('Sign in to continue.')
    await act(async () => mocks.listener?.('SIGNED_IN', { user: { id: 'admin-1' } }))
    await screen.findByText('Calendar ready')
    await userEvent.click(screen.getAllByRole('button', { name: /^Students$/ })[0])
    await userEvent.click(await screen.findByRole('button', { name: /Add Student/ }))
    const dialog = within(await screen.findByRole('dialog'))

    await userEvent.selectOptions(dialog.getByRole('combobox', { name: 'Package' }), '1')
    expect(dialog.getByText('No Account Fee or Mirai Club for this package.')).toBeInTheDocument()
    expect(dialog.getByLabelText('Account Fee Expiry Date')).toHaveValue(today)
    expect(dialog.getByLabelText('Lesson Expiry Date')).toHaveValue(addMonths(today, 1))
  })
})
