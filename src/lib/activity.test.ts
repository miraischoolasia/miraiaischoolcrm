import { describe, expect, it } from 'vitest'
import { describeActivity, getActivityArea, getActivityDayLabel } from './activity'
import type { AdminActivity } from '../types/domain'

const names = {
  teacher: (id: number) => ({ 9: 'Ho Jia Hui', 10: 'Saw Zen Ho' })[id],
  classroom: (id: number) => ({ 10: 'Wed Coder Pro', 11: 'Sat Coder Pro' })[id],
}

const activity = (overrides: Partial<AdminActivity>): AdminActivity => ({
  id: 1,
  actorTeacherId: 1,
  actionType: 'student_updated',
  entityType: 'student',
  entityId: 5,
  entityLabel: 'Branson See',
  details: {},
  createdAt: '2026-10-03T10:00:00Z',
  ...overrides,
})

describe('describeActivity', () => {
  it('shows only what changed, with names instead of ids', () => {
    const view = describeActivity(
      activity({
        details: {
          previous_teacher_id: 9,
          new_teacher_id: 9,
          previous_classroom_id: 10,
          new_classroom_id: 11,
          previous_student_type: 'trial',
          new_student_type: 'regular',
        },
      }),
      names,
    )

    expect(view.title).toBe('Updated student Branson See')
    expect(view.changes).toEqual([
      { label: 'Classroom', from: 'Wed Coder Pro', to: 'Sat Coder Pro' },
      { label: 'Type', from: 'Trial', to: 'Regular' },
    ])
  })

  it('sums up a renewal in plain words', () => {
    const view = describeActivity(
      activity({
        actionType: 'student_renewed',
        details: {
          package: '6 Months',
          classes_added: 24,
          lesson_expiry: '2027-04-05',
          account_fee_expiry: '2027-10-05',
        },
      }),
      names,
    )

    expect(view.title).toBe('Renewed Branson See')
    expect(view.notes).toEqual([
      'Package: 6 Months',
      '+24 classes',
      'Lessons until Apr 5, 2027',
      'Account Fee until Oct 5, 2027',
    ])
  })

  it('names the lead stage and the trial child', () => {
    expect(
      describeActivity(
        activity({ actionType: 'lead_stage_changed', entityType: 'lead', entityLabel: 'Jane', details: { status: 'trial_scheduled' } }),
        names,
      ).title,
    ).toBe('Moved lead Jane to Trial Scheduled')
    expect(
      describeActivity(
        activity({
          actionType: 'trial_booked',
          entityType: 'schedule',
          entityLabel: 'HOA Saturday',
          details: { child_name: 'Aiden', booking_date: '2026-10-10' },
        }),
        names,
      ),
    ).toEqual({ title: 'Booked a trial for Aiden on Oct 10, 2026', changes: [], notes: ['Slot: HOA Saturday'] })
  })

  it('falls back to readable words for an unknown action', () => {
    const view = describeActivity(
      activity({ actionType: 'something_new', details: { from_date: '2026-10-01', count: 2, nested: { a: 1 } } }),
      names,
    )
    expect(view).toEqual({
      title: 'Something new: Branson See',
      changes: [],
      notes: ['From date: Oct 1, 2026', 'Count: 2'],
    })
  })
})

describe('getActivityArea', () => {
  it('groups by what was changed', () => {
    expect(getActivityArea(activity({ entityType: 'lead' }))).toBe('leads')
    expect(getActivityArea(activity({ entityType: 'schedule' }))).toBe('classes')
    expect(getActivityArea(activity({ entityType: 'classroom' }))).toBe('classes')
    expect(getActivityArea(activity({ entityType: 'teacher' }))).toBe('team')
  })
})

describe('getActivityDayLabel', () => {
  it('says Today and Yesterday, then the date', () => {
    expect(getActivityDayLabel('2026-10-03', '2026-10-03')).toBe('Today')
    expect(getActivityDayLabel('2026-10-02', '2026-10-03')).toBe('Yesterday')
    expect(getActivityDayLabel('2026-09-30', '2026-10-01')).toBe('Yesterday')
    expect(getActivityDayLabel('2026-09-28', '2026-10-03')).toBe('Sep 28, 2026')
  })
})

describe('describeActivity for bulk lead changes', () => {
  const bulk = (bulk_action: string, value: string, count = 12) =>
    describeActivity(
      activity({
        actionType: 'lead_bulk_updated',
        entityType: 'lead',
        entityId: null,
        entityLabel: `${count} leads`,
        details: { bulk_action, value, count },
      }),
      names,
    ).title

  it('says what was done to how many leads', () => {
    expect(bulk('stage', 'contacted')).toBe('Moved 12 leads to Contacted')
    expect(bulk('pic', 'Alex')).toBe('Assigned 12 leads to Alex')
    expect(bulk('pic', '')).toBe('Cleared the PIC of 12 leads')
    expect(bulk('source', 'Walk-in')).toBe('Set the source of 12 leads to Walk-in')
    expect(bulk('tag-add', 'Hot')).toBe('Added the tag Hot to 12 leads')
    expect(bulk('tag-remove', 'Hot')).toBe('Removed the tag Hot from 12 leads')
  })

  it('says lead, not leads, for one', () => {
    expect(bulk('stage', 'lost', 1)).toBe('Moved 1 lead to Lost')
  })

  it('copes with an action it does not know', () => {
    expect(bulk('something-new', '')).toBe('Changed 12 leads')
  })

  it('says how many leads were deleted, under Leads', () => {
    const deleted = activity({
      actionType: 'lead_bulk_deleted',
      entityType: 'lead',
      entityId: null,
      entityLabel: '5 leads',
      details: { bulk_action: 'delete', value: '', count: 5 },
    })

    expect(describeActivity(deleted, names).title).toBe('Deleted 5 leads')
    expect(getActivityArea(deleted)).toBe('leads')
  })
})
