import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as null | { code: string; message: string } },
  // Results handed out before falling back to `result`, one per query.
  queue: [] as { data: unknown; error: null | { code: string; message: string } }[],
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        // Chainable .order().order(); awaiting it takes the next result.
        let result: unknown
        const chain = {
          order: () => chain,
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
            result ??= mocks.queue.shift() ?? mocks.result
            return Promise.resolve(result).then(resolve, reject)
          },
        }
        return chain
      },
    }),
  },
}))

import {
  fetchLeadsFromSupabase,
  fetchPackagesFromSupabase,
  fetchStudentsFromSupabase,
  fetchScheduleExceptionsFromSupabase,
  fetchTrialBookingsFromSupabase,
} from './api'

describe('fetchScheduleExceptionsFromSupabase', () => {
  beforeEach(() => {
    mocks.result = { data: null, error: null }
    mocks.queue = []
  })

  it('maps rows from the schedule_exceptions table', async () => {
    mocks.result = {
      data: [{ id: 1, schedule_id: 10, exception_date: '2026-12-01', reason: 'Leave' }],
      error: null,
    }

    await expect(fetchScheduleExceptionsFromSupabase()).resolves.toEqual([
      { id: 1, scheduleId: 10, exceptionDate: '2026-12-01', reason: 'Leave', movedToScheduleId: null },
    ])
  })

  it.each(['PGRST205', '42P01'])(
    'treats a missing table (%s) as no cancelled days instead of failing the workspace load',
    async (code) => {
      mocks.result = { data: null, error: { code, message: 'relation does not exist' } }

      await expect(fetchScheduleExceptionsFromSupabase()).resolves.toEqual([])
    },
  )

  it('loads without moved_to_schedule_id before that column exists', async () => {
    mocks.queue = [{ data: null, error: { code: '42703', message: 'column does not exist' } }]
    mocks.result = {
      data: [{ id: 1, schedule_id: 10, exception_date: '2026-12-01', reason: null }],
      error: null,
    }

    await expect(fetchScheduleExceptionsFromSupabase()).resolves.toEqual([
      { id: 1, scheduleId: 10, exceptionDate: '2026-12-01', reason: null, movedToScheduleId: null },
    ])
  })

  it('still surfaces any other database error', async () => {
    const error = { code: '42501', message: 'permission denied' }
    mocks.result = { data: null, error }

    await expect(fetchScheduleExceptionsFromSupabase()).rejects.toBe(error)
  })
})

describe('fetchTrialBookingsFromSupabase', () => {
  beforeEach(() => {
    mocks.result = { data: null, error: null }
  })

  it('maps rows from the trial_bookings table', async () => {
    mocks.result = {
      data: [
        {
          id: 5,
          schedule_id: 300,
          booking_date: '2026-09-26',
          lead_id: 9,
          student_id: 501,
          child_name: 'Aiden',
          child_age: 9,
          phone: '+60 12-222 2222',
          notes: null,
        },
      ],
      error: null,
    }

    await expect(fetchTrialBookingsFromSupabase()).resolves.toEqual([
      {
        id: 5,
        scheduleId: 300,
        bookingDate: '2026-09-26',
        leadId: 9,
        studentId: 501,
        childName: 'Aiden',
        childAge: 9,
        phone: '+60 12-222 2222',
        notes: null,
      },
    ])
  })

  it('treats a missing trial_bookings table as no bookings instead of failing the load', async () => {
    mocks.result = { data: null, error: { code: 'PGRST205', message: 'not in schema cache' } }

    await expect(fetchTrialBookingsFromSupabase()).resolves.toEqual([])
  })

  it('still surfaces any other database error', async () => {
    const error = { code: '42501', message: 'permission denied' }
    mocks.result = { data: null, error }

    await expect(fetchTrialBookingsFromSupabase()).rejects.toBe(error)
  })
})

describe('fetchLeadsFromSupabase', () => {
  beforeEach(() => {
    mocks.result = { data: null, error: null }
    mocks.queue = []
  })

  it('loads leads without source/PIC before those columns exist', async () => {
    mocks.queue = [{ data: null, error: { code: '42703', message: 'column does not exist' } }]
    mocks.result = {
      data: [
        {
          id: 1,
          full_name: 'Jane',
          phone: null,
          status: 'new',
          children: [],
          notes: null,
          follow_ups: [],
          tasks: [],
          converted_student_id: null,
          added_date: '2026-09-30',
          created_at: '',
          updated_at: '',
        },
      ],
      error: null,
    }

    const [lead] = await fetchLeadsFromSupabase()
    expect(lead).toMatchObject({ id: 1, fullName: 'Jane', sourceId: null, picId: null })
  })
})

describe('packages before the migration', () => {
  beforeEach(() => {
    mocks.result = { data: null, error: null }
    mocks.queue = []
  })

  it('loads students without package_id before that column exists', async () => {
    mocks.queue = [{ data: null, error: { code: '42703', message: 'column does not exist' } }]
    mocks.result = {
      data: [
        {
          id: 1,
          teacher_id: null,
          classroom_id: null,
          full_name: 'Ali',
          phone: null,
          age: null,
          remaining_hours: 8,
          lesson_expiry_date: '2026-12-01',
          account_fee_expiry_date: '2026-12-01',
          mirai_club_expiry_date: '2026-12-01',
          notes: null,
          is_active: true,
          student_type: 'regular',
        },
      ],
      error: null,
    }

    const [student] = await fetchStudentsFromSupabase()
    expect(student).toMatchObject({ id: 1, name: 'Ali', packageId: null })
  })

  it('has no packages when the table does not exist yet', async () => {
    mocks.result = { data: null, error: { code: 'PGRST205', message: 'table not found' } }

    expect(await fetchPackagesFromSupabase()).toEqual([])
  })
})
