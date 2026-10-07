import { describe, expect, it } from 'vitest'
import { parseLeadCsv } from './leadCsv'
import type { LeadOption } from '../types/domain'

const options: LeadOption[] = [
  { id: 1, kind: 'source', label: 'Walk-in', isActive: true, legacyKey: 'walk_in', color: null },
  { id: 5, kind: 'source', label: 'Other', isActive: true, legacyKey: 'other', color: null },
  { id: 9, kind: 'source', label: 'Facebook Ads', isActive: true, legacyKey: null, color: null },
  { id: 20, kind: 'pic', label: 'Walk In', isActive: true, legacyKey: null, color: null },
]

const csv = (source: string) => `Parent Name,Phone,Source\r\nJane,0123,${source}\r\n`

describe('parseLeadCsv sources', () => {
  it('matches a source by name or old key, ignoring case, spaces and dashes', () => {
    expect(parseLeadCsv(csv('facebook ads'), '2026-09-30', options).rows[0].source_id).toBe(9)
    expect(parseLeadCsv(csv('walk_in'), '2026-09-30', options).rows[0].source_id).toBe(1)
    expect(parseLeadCsv(csv('WALK-IN'), '2026-09-30', options).rows[0].source_id).toBe(1)
  })

  it('leaves an empty source to the database default', () => {
    expect(parseLeadCsv(csv(''), '2026-09-30', options).rows[0].source_id).toBeNull()
  })

  it('reports an unknown source and never matches a PIC name', () => {
    const result = parseLeadCsv(csv('TikTok'), '2026-09-30', options)
    expect(result.errors[0]).toMatch(/unknown source "TikTok"/)
  })
})
