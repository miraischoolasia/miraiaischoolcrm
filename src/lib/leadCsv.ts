import { MAX_LEAD_CHILDREN, leadSourceOptions, leadStatusOptions } from './constants'
import type { LeadSource, LeadStatus } from '../types/domain'

export type BulkLeadChild = { name: string; age: number; phone: string | null }

export type BulkLeadRow = {
  full_name: string | null
  phone: string | null
  source: LeadSource
  status: LeadStatus
  children: BulkLeadChild[]
  notes: string | null
  added_date: string
}

export type LeadCsvParseResult = {
  rows: BulkLeadRow[]
  errors: string[]
}

export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (char === '\r') {
      i += 1
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += char
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((cells) => !(cells.length === 1 && cells[0].trim() === ''))
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function getLeadCsvHeaders(): string[] {
  const headers = ['Parent Name', 'Phone', 'Source', 'Stage', 'Added Date', 'Notes']
  for (let index = 1; index <= MAX_LEAD_CHILDREN; index += 1) {
    headers.push(`Child ${index} Name`, `Child ${index} Age`, `Child ${index} Phone`)
  }
  return headers
}

export function buildLeadCsvTemplate(): string {
  const headers = getLeadCsvHeaders()
  const exampleRows = [
    [
      'Jane Tan',
      '+65 9123 4567',
      'referral',
      'new',
      '2026-09-01',
      'Interested in coding classes for two kids',
      'Ethan Tan',
      '9',
      '+65 9123 4568',
      'Mia Tan',
      '7',
      '',
      '',
      '',
      '',
    ],
    [
      'Wei Ling',
      '+65 8123 9988',
      'walk_in',
      'contacted',
      '2026-09-03',
      '',
      'Wei Ling Jr',
      '11',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ]

  const lines = [headers, ...exampleRows].map((row) => row.map(csvEscape).join(','))
  return `${lines.join('\r\n')}\r\n`
}

export function parseLeadCsv(text: string, todayString: string): LeadCsvParseResult {
  const table = parseCsvTable(text)
  const errors: string[] = []
  const rows: BulkLeadRow[] = []

  if (table.length === 0) {
    return { rows, errors: ['The file is empty.'] }
  }

  const headerRow = table[0].map((cell) => cell.trim().toLowerCase())
  const dataRows = table.slice(1)

  function columnIndex(label: string) {
    return headerRow.indexOf(label.toLowerCase())
  }

  const fullNameIdx = columnIndex('Parent Name')
  const phoneIdx = columnIndex('Phone')
  const sourceIdx = columnIndex('Source')
  const stageIdx = columnIndex('Stage')
  const addedDateIdx = columnIndex('Added Date')
  const notesIdx = columnIndex('Notes')

  const childColumns = Array.from({ length: MAX_LEAD_CHILDREN }, (_, index) => ({
    nameIdx: columnIndex(`Child ${index + 1} Name`),
    ageIdx: columnIndex(`Child ${index + 1} Age`),
    phoneIdx: columnIndex(`Child ${index + 1} Phone`),
  }))

  const sourceKeys = new Set(leadSourceOptions.map((option) => option.key as string))
  const statusKeys = new Set(leadStatusOptions.map((option) => option.key as string))
  const sourceByLabel = new Map(
    leadSourceOptions.map((option) => [option.label.toLowerCase(), option.key]),
  )
  const statusByLabel = new Map(
    leadStatusOptions.map((option) => [option.label.toLowerCase(), option.key]),
  )

  if (dataRows.length === 0) {
    errors.push('No data rows found below the header.')
  }

  dataRows.forEach((cells, rowIndex) => {
    const lineNumber = rowIndex + 2
    const isBlank = cells.every((cell) => cell.trim() === '')
    if (isBlank) {
      return
    }

    const fullName = fullNameIdx >= 0 ? cells[fullNameIdx]?.trim() || null : null
    const phone = phoneIdx >= 0 ? cells[phoneIdx]?.trim() || null : null
    const notes = notesIdx >= 0 ? cells[notesIdx]?.trim() || null : null

    let source: LeadSource = 'other'
    const rawSource = (sourceIdx >= 0 ? cells[sourceIdx] : '')?.trim() ?? ''
    if (rawSource) {
      const normalized = rawSource.toLowerCase().replace(/\s+/g, '_')
      if (sourceKeys.has(normalized)) {
        source = normalized as LeadSource
      } else if (sourceByLabel.has(rawSource.toLowerCase())) {
        source = sourceByLabel.get(rawSource.toLowerCase()) as LeadSource
      } else {
        errors.push(`Row ${lineNumber}: unknown source "${rawSource}".`)
      }
    }

    let status: LeadStatus = 'new'
    const rawStatus = (stageIdx >= 0 ? cells[stageIdx] : '')?.trim() ?? ''
    if (rawStatus) {
      const normalized = rawStatus.toLowerCase().replace(/\s+/g, '_')
      if (statusKeys.has(normalized)) {
        status = normalized as LeadStatus
      } else if (statusByLabel.has(rawStatus.toLowerCase())) {
        status = statusByLabel.get(rawStatus.toLowerCase()) as LeadStatus
      } else {
        errors.push(`Row ${lineNumber}: unknown stage "${rawStatus}".`)
      }
    }

    let addedDate = todayString
    const rawDate = (addedDateIdx >= 0 ? cells[addedDateIdx] : '')?.trim() ?? ''
    if (rawDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        addedDate = rawDate
      } else {
        errors.push(`Row ${lineNumber}: added date "${rawDate}" must be in YYYY-MM-DD format.`)
      }
    }

    const children: BulkLeadChild[] = []
    childColumns.forEach((column, childIndex) => {
      const rawAge = (column.ageIdx >= 0 ? cells[column.ageIdx] : '')?.trim() ?? ''
      if (!rawAge) {
        return
      }
      const age = Number(rawAge)
      if (!Number.isInteger(age) || age < 1 || age > 25) {
        errors.push(
          `Row ${lineNumber}: child ${childIndex + 1} age "${rawAge}" is not a valid number.`,
        )
        return
      }
      const name = column.nameIdx >= 0 ? cells[column.nameIdx]?.trim() || '' : ''
      const childPhone = column.phoneIdx >= 0 ? cells[column.phoneIdx]?.trim() || null : null
      children.push({ name, age, phone: childPhone })
    })

    rows.push({
      full_name: fullName,
      phone,
      source,
      status,
      children,
      notes,
      added_date: addedDate,
    })
  })

  return { rows, errors }
}
