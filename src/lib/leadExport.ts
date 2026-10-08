import { leadStatusOptions } from './constants'
import { csvCell } from './leadCsv'
import type { CheckColumn } from './leadTags'
import type { Lead, LeadOption } from '../types/domain'

// The selected leads as a spreadsheet: who they are, where they came from,
// how far they were followed up. Names and notes come from people, so every
// cell is guarded against being run as a formula.
export function buildLeadsExportCsv(
  leads: Lead[],
  options: LeadOption[],
  checkColumns: CheckColumn[],
) {
  const label = new Map(options.map((option) => [option.id, option.label]))
  const header = [
    'Added',
    'Name',
    'Phone',
    'State',
    'Children',
    'Source',
    'PIC',
    'Stage',
    'Tags',
    ...checkColumns.map((column) => column.label),
    'Notes',
  ]

  const rows = leads.map((lead) => [
    lead.addedDate,
    lead.fullName ?? '',
    lead.phone ?? '',
    lead.state ?? '',
    lead.children
      .map((child) => `${child.name || 'Child'} (${child.age})${child.phone ? ` ${child.phone}` : ''}`)
      .join('; '),
    (lead.sourceId !== null && label.get(lead.sourceId)) || '',
    (lead.picId !== null && label.get(lead.picId)) || '',
    leadStatusOptions.find((option) => option.key === lead.status)?.label ?? lead.status,
    lead.tagIds.flatMap((id) => label.get(id) ?? []).join('; '),
    ...checkColumns.map((column) => (lead.checks[column.slot] ? 'Yes' : '')),
    lead.notes ?? '',
  ])

  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}
