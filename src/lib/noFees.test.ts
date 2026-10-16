import { describe, expect, it, vi } from 'vitest'

// A school that does not charge the Account Fee or a membership fee (EduHero): nothing about fees shows.
vi.mock('./brand', () => ({
  brand: { name: 'EduHero', clubName: 'Membership', usesFees: false, usesMiraiArt: false, logo: null, favicon: null, company: '' },
}))

const { getStudentStatus } = await import('../domain/studentStatus')
const { planFeeChange } = await import('./packages')
const { TRIGGERS } = await import('./automationFlows')
const { FLOW_RECIPES } = await import('./flowSteps')

const regular = {
  remainingHours: 10,
  lessonExpiryDate: '2027-03-01',
  accountFeeExpiryDate: '2020-01-01',
  miraiClubExpiryDate: '2020-01-01',
  isActive: true,
  studentType: 'regular' as const,
}

describe('a school with no fees', () => {
  it('never raises a fee alert, even for dates long past', () => {
    const status = getStudentStatus({ ...regular, feesApply: true }, '2026-10-16')

    expect(status.accountFeeNeedsAttention).toBe(false)
    expect(status.miraiClubNeedsAttention).toBe(false)
    expect(status.tags.map((tag) => tag.label)).toEqual(['Normal'])
  })

  it('plans no fee change, whatever the package says', () => {
    const pkg = { includesFees: true } as Parameters<typeof planFeeChange>[0]

    expect(planFeeChange(pkg, '2026-11-01', '2027-02-01', null, [])).toBeNull()
  })

  it('offers no fee trigger and no fee reminder to start from', () => {
    expect(TRIGGERS.map((entry) => entry.key)).not.toContain('account_fee_expiry')
    expect(TRIGGERS.map((entry) => entry.key)).not.toContain('club_fee_expiry')
    expect(FLOW_RECIPES.map((entry) => entry.key)).not.toContain('fee_ending')
  })
})
