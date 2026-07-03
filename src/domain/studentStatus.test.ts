import { describe, expect, it } from 'vitest'
import { getDateMeta, getStudentStatus } from './studentStatus'

const today = '2026-07-03'
const healthyStudent = {
  remainingHours: 12,
  lessonExpiryDate: '2026-09-01',
  accountFeeExpiryDate: '2026-09-01',
  miraiClubExpiryDate: '2026-09-01',
  isActive: true,
}

describe('getStudentStatus', () => {
  it('returns Normal when every membership condition is healthy', () => {
    const status = getStudentStatus(healthyStudent, today)

    expect(status.isNormal).toBe(true)
    expect(status.tags).toEqual([{ label: 'Normal', tone: 'healthy' }])
  })

  it('flags two or fewer remaining classes, including negative balances', () => {
    expect(
      getStudentStatus({ ...healthyStudent, remainingHours: 2 }, today).hoursLow,
    ).toBe(true)
    expect(
      getStudentStatus({ ...healthyStudent, remainingHours: -1 }, today).hoursLow,
    ).toBe(true)
  })

  it('flags an expired lesson validity date independently of balance', () => {
    const status = getStudentStatus(
      { ...healthyStudent, lessonExpiryDate: '2026-07-02' },
      today,
    )

    expect(status.lessonExpired).toBe(true)
    expect(status.tags.map((tag) => tag.label)).toContain('Lesson Expired')
  })

  it('flags Account Fee and Mirai Club inside the 14-day window', () => {
    const status = getStudentStatus(
      {
        ...healthyStudent,
        accountFeeExpiryDate: '2026-07-16',
        miraiClubExpiryDate: '2026-07-10',
      },
      today,
    )

    expect(status.accountFeeNeedsAttention).toBe(true)
    expect(status.miraiClubNeedsAttention).toBe(true)
  })

  it('does not flag a date exactly 14 days away', () => {
    expect(getDateMeta('2026-07-17', today).dueSoon).toBe(false)
  })

  it('keeps deactivation visible alongside other warnings', () => {
    const status = getStudentStatus(
      { ...healthyStudent, remainingHours: 0, isActive: false },
      today,
    )

    expect(status.tags.map((tag) => tag.label)).toEqual([
      'Deactivated',
      'Classes Low',
    ])
  })
})
