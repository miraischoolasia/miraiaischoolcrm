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

describe('the State column', () => {
  const csv = (state: string) => `Parent Name,Phone,State,Stage\r\nMei Ling,0123456789,${state},new\r\n`

  it('reads a state by name, ignoring capitals and spacing', () => {
    expect(parseLeadCsv(csv('negeri  sembilan'), '2026-10-09').rows[0].state).toBe('Negeri Sembilan')
  })

  it('understands Penang and KL', () => {
    expect(parseLeadCsv(csv('Penang'), '2026-10-09').rows[0].state).toBe('Pulau Pinang')
    expect(parseLeadCsv(csv('KL'), '2026-10-09').rows[0].state).toBe('Kuala Lumpur')
  })

  it('reports a state that does not exist and leaves the row without one', () => {
    const { rows, errors } = parseLeadCsv(csv('Atlantis'), '2026-10-09')

    expect(errors[0]).toMatch(/unknown state "Atlantis"/)
    expect(rows[0].state).toBeUndefined()
  })

  it('still reads a file that has no State column', () => {
    const { rows, errors } = parseLeadCsv('Parent Name,Phone\r\nMei Ling,0123456789\r\n', '2026-10-09')

    expect(errors).toEqual([])
    expect(rows[0]).not.toHaveProperty('state')
  })
})
