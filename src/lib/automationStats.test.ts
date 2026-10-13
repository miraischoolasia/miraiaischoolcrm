import { describe, expect, it } from 'vitest'
import { describeStats, type FlowStats } from './automationStats'

const stats = (change: Partial<FlowStats> = {}): FlowStats => ({
  flowId: 1,
  queued: 0,
  sent: 0,
  pending: 0,
  skipped: 0,
  expired: 0,
  failed: 0,
  replied: 0,
  ...change,
})

describe('what a flow has done, in one line', () => {
  it('says nothing for a flow that has made no message', () => {
    expect(describeStats(undefined)).toBeNull()
    expect(describeStats(stats())).toBeNull()
  })

  it('counts sent, replied with a percentage, waiting, skipped and failed', () => {
    expect(describeStats(stats({ queued: 10, sent: 8, replied: 2, pending: 1, skipped: 1 }))).toBe(
      '8 sent · 2 replied (25%) · 1 waiting · 1 skipped',
    )
    expect(describeStats(stats({ queued: 3, sent: 1, failed: 2 }))).toBe('1 sent · 0 replied · 2 failed')
  })

  it('does not show replies for a flow that has sent nothing yet', () => {
    expect(describeStats(stats({ queued: 2, pending: 2 }))).toBe('0 sent · 2 waiting')
  })
})
