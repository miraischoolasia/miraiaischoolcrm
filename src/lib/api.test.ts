import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as null | { code: string; message: string } },
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: async () => mocks.result,
      }),
    }),
  },
}))

import { fetchScheduleExceptionsFromSupabase, fetchTrialBookingsFromSupabase } from './api'

describe('fetchScheduleExceptionsFromSupabase', () => {
  beforeEach(() => {
    mocks.result = { data: null, error: null }
  })

  it('maps rows from the schedule_exceptions table', async () => {
    mocks.result = {
      data: [{ id: 1, schedule_id: 10, exception_date: '2026-12-01', reason: 'Leave' }],
      error: null,
    }

    await expect(fetchScheduleExceptionsFromSupabase()).resolves.toEqual([
      { id: 1, scheduleId: 10, exceptionDate: '2026-12-01', reason: 'Leave' },
    ])
  })

  it.each(['PGRST205', '42P01'])(
    'treats a missing table (%s) as no cancelled days instead of failing the workspace load',
    async (code) => {
      mocks.result = { data: null, error: { code, message: 'relation does not exist' } }

      await expect(fetchScheduleExceptionsFromSupabase()).resolves.toEqual([])
    },
  )

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
