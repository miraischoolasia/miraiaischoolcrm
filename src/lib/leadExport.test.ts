import { describe, expect, it } from 'vitest'
import { buildLeadsExportCsv } from './leadExport'
import { getCheckColumns } from './leadTags'
import type { Lead, LeadOption } from '../types/domain'

const options: LeadOption[] = [
  { id: 1, kind: 'source', label: 'Walk-in', isActive: true, legacyKey: 'walk_in', color: null },
  { id: 10, kind: 'pic', label: 'Alex', isActive: true, legacyKey: null, color: null },
  { id: 20, kind: 'tag', label: 'Hot', isActive: true, legacyKey: null, color: '#ef4444' },
  { id: 21, kind: 'tag', label: 'VIP, gold', isActive: true, legacyKey: null, color: '#8b5cf6' },
  { id: 101, kind: 'check', label: 'RM99 pack', isActive: true, legacyKey: 'check_1', color: null },
  { id: 102, kind: 'check', label: 'Joined event', isActive: true, legacyKey: 'check_2', color: null },
]
const columns = getCheckColumns(options)

function lead(patch: Partial<Lead>): Lead {
  return {
    id: 1,
    fullName: 'Mrs Lim',
    phone: '60123456789',
    sourceId: 1,
    picId: 10,
    tagIds: [],
    checks: {},
    status: 'contacted',
    children: [],
    notes: null,
    followUps: [],
    tasks: [],
    convertedStudentId: null,
    addedDate: '2026-10-06',
    createdAt: '',
    updatedAt: '',
    ...patch,
  }
}

const lines = (csv: string) => csv.trim().split('\r\n')

describe('buildLeadsExportCsv', () => {
  it('has a title row with the names the admin gave the tick columns', () => {
    const [header] = lines(buildLeadsExportCsv([], options, columns))

    expect(header).toBe('Added,Name,Phone,Children,Source,PIC,Stage,Tags,RM99 pack,Joined event,Notes')
  })

  it('writes one row per lead with names instead of ids', () => {
    const csv = buildLeadsExportCsv(
      [
        lead({
          children: [
            { name: 'Ken', age: 9, phone: null },
            { name: '', age: 7, phone: '60111112222' },
          ],
          tagIds: [20, 21],
          checks: { 2: { at: '2026-10-06T00:00:00Z', by: 4 } },
          notes: 'Wants Saturday',
        }),
      ],
      options,
      columns,
    )

    expect(lines(csv)[1]).toBe(
      '2026-10-06,Mrs Lim,60123456789,Ken (9); Child (7) 60111112222,Walk-in,Alex,Contacted,"Hot; VIP, gold",,Yes,Wants Saturday',
    )
  })

  it('leaves out what a lead does not have', () => {
    const csv = buildLeadsExportCsv(
      [lead({ fullName: null, phone: null, sourceId: null, picId: null, tagIds: [999] })],
      options,
      columns,
    )

    expect(lines(csv)[1]).toBe('2026-10-06,,,,,,Contacted,,,,')
  })

  it('has no tick columns before the database has them', () => {
    const csv = buildLeadsExportCsv([lead({})], options, [])

    expect(lines(csv)[0]).toBe('Added,Name,Phone,Children,Source,PIC,Stage,Tags,Notes')
  })

  it('keeps a spreadsheet from running a name or note that starts like a formula', () => {
    const csv = buildLeadsExportCsv(
      [lead({ fullName: '=HYPERLINK("http://evil.test")', notes: '@SUM(1)' })],
      options,
      columns,
    )

    const row = lines(csv)[1]
    expect(row).toContain(`"'=HYPERLINK(""http://evil.test"")"`)
    expect(row).toContain("'@SUM(1)")
  })

  it('quotes notes with commas and line breaks', () => {
    const csv = buildLeadsExportCsv([lead({ notes: 'line one,\nline two' })], options, columns)

    expect(csv).toContain('"line one,\nline two"')
  })
})
