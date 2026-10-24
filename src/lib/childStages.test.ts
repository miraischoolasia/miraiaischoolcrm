import { describe, expect, it } from 'vitest'
import { childStageKey, otherChildStages, rollupStage } from './childStages'

describe('child stages', () => {
  it('a child without a stage follows the family', () => {
    expect(childStageKey({}, 'contacted')).toBe('contacted')
    expect(childStageKey({ stage: 'trial_scheduled' }, 'contacted')).toBe('trial_scheduled')
    expect(childStageKey({ stage: 'no_such_stage' }, 'contacted')).toBe('contacted')
  })

  it('works the family stage out like the database does', () => {
    expect(rollupStage([], 'contacted')).toBe('contacted')
    expect(rollupStage([{}, {}], 'trial_scheduled')).toBe('trial_scheduled')
    expect(rollupStage([{ stage: 'trial_scheduled' }, {}], 'contacted')).toBe('contacted')
    expect(rollupStage([{ stage: 'trial_scheduled' }, { stage: 'trial_completed' }], 'new')).toBe('trial_scheduled')
    expect(rollupStage([{ stage: 'converted' }, { stage: 'contacted' }], 'new')).toBe('contacted')
    expect(rollupStage([{ stage: 'lost' }, { stage: 'trial_scheduled' }], 'new')).toBe('trial_scheduled')
    expect(rollupStage([{ stage: 'lost' }, { stage: 'lost' }], 'new')).toBe('lost')
    expect(rollupStage([{ stage: 'converted' }, { stage: 'converted' }], 'new')).toBe('converted')
    expect(rollupStage([{ stage: 'converted' }, { stage: 'lost' }], 'new')).toBe('converted')
  })

  it('lists the children whose stage differs from the family', () => {
    expect(otherChildStages([{ name: 'Mia' }, { name: 'Ben', stage: 'trial_scheduled' }], 'contacted')).toEqual([
      { name: 'Ben', key: 'trial_scheduled', label: 'Trial Scheduled' },
    ])
    expect(otherChildStages([{ name: '' }, { name: 'Ben' }], 'contacted')).toEqual([])
  })
})
