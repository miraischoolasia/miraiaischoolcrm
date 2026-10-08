import { MALAYSIAN_STATES, MAX_LEAD_CHILDREN, leadStatusOptions } from './constants'
import type { LeadOption, LeadStatus } from '../types/domain'

export type BulkLeadChild = { name: string; age: number; phone: string | null }

export type BulkLeadRow = {
  full_name: string | null
  phone: string | null
  // null lets the database fall back to the "Other" source.
  source_id: number | null
  status: LeadStatus
  children: BulkLeadChild[]
  notes: string | null
  added_date: string
  // Only present when the file named a state.
  state?: string
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

// A cell for a file a spreadsheet opens: text that starts like a formula gets a
// quote in front, so it is shown as text and never run.
export function csvCell(value: string): string {
  return csvEscape(/^[=@\t\r]|^[+-][^0-9\s().+-]/.test(value) ? `'${value}` : value)
}

export function getLeadCsvHeaders(): string[] {
  const headers = ['Parent Name', 'Phone', 'State', 'Source', 'Stage', 'Added Date', 'Notes']
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
      'Selangor',
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
      'Pulau Pinang',
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

export function parseLeadCsv(
  text: string,
  todayString: string,
  sourceOptions: LeadOption[] = [],
): LeadCsvParseResult {
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
  const stateIdx = columnIndex('State')
  const sourceIdx = columnIndex('Source')
  const stageIdx = columnIndex('Stage')
  const addedDateIdx = columnIndex('Added Date')
  const notesIdx = columnIndex('Notes')

  const childColumns = Array.from({ length: MAX_LEAD_CHILDREN }, (_, index) => ({
    nameIdx: columnIndex(`Child ${index + 1} Name`),
    ageIdx: columnIndex(`Child ${index + 1} Age`),
    phoneIdx: columnIndex(`Child ${index + 1} Phone`),
  }))

  // A source matches by its name ("Walk-in") or the old key ("walk_in"),
  // ignoring case, spaces and dashes.
  const normalizeSource = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, '')
  const sourceByName = new Map<string, number>()
  for (const option of sourceOptions.filter((entry) => entry.kind === 'source')) {
    sourceByName.set(normalizeSource(option.label), option.id)
    if (option.legacyKey) {
      sourceByName.set(normalizeSource(option.legacyKey), option.id)
    }
  }
  // A state matches by its name, ignoring case and spacing; two common short forms work too.
  const stateKey = (value: string) => value.toLowerCase().replace(/\s+/g, '')
  const stateByName = new Map<string, string>(MALAYSIAN_STATES.map((state) => [stateKey(state), state]))
  stateByName.set('penang', 'Pulau Pinang')
  stateByName.set('kl', 'Kuala Lumpur')
  const statusKeys = new Set(leadStatusOptions.map((option) => option.key as string))
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

    let sourceId: number | null = null
    const rawSource = (sourceIdx >= 0 ? cells[sourceIdx] : '')?.trim() ?? ''
    if (rawSource) {
      const matched = sourceByName.get(normalizeSource(rawSource))
      if (matched !== undefined) {
        sourceId = matched
      } else {
        errors.push(
          `Row ${lineNumber}: unknown source "${rawSource}". Add it under Leads > Sources & PIC first.`,
        )
      }
    }

    let state: string | undefined
    const rawState = (stateIdx >= 0 ? cells[stateIdx] : '')?.trim() ?? ''
    if (rawState) {
      state = stateByName.get(stateKey(rawState))
      if (!state) {
        errors.push(`Row ${lineNumber}: unknown state "${rawState}". Use a Malaysian state such as Selangor.`)
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
      source_id: sourceId,
      status,
      children,
      notes,
      added_date: addedDate,
      ...(state ? { state } : {}),
    })
  })

  return { rows, errors }
}
