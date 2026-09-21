import { csvEscape, parseCsvTable } from './leadCsv'

export type BulkPreviewStudentRow = {
  full_name: string
  phone: string
}

export type PreviewStudentCsvParseResult = {
  rows: BulkPreviewStudentRow[]
  errors: string[]
}

export function getPreviewStudentCsvHeaders(): string[] {
  return ['Student Name', 'Phone']
}

export function buildPreviewStudentCsvTemplate(): string {
  const exampleRows = [
    ['Aiden Tan', '+60 12-345 6789'],
    ['Mei Ling', '+60 16-222 8899'],
  ]
  const lines = [getPreviewStudentCsvHeaders(), ...exampleRows].map((row) =>
    row.map(csvEscape).join(','),
  )

  return `${lines.join('\r\n')}\r\n`
}

export function parsePreviewStudentCsv(text: string): PreviewStudentCsvParseResult {
  const table = parseCsvTable(text)
  const errors: string[] = []
  const rows: BulkPreviewStudentRow[] = []

  if (table.length === 0) {
    return { rows, errors: ['The file is empty.'] }
  }

  const headerRow = table[0].map((cell) => cell.trim().toLowerCase())
  const dataRows = table.slice(1)

  function columnIndex(label: string) {
    return headerRow.indexOf(label.toLowerCase())
  }

  const nameIdx = columnIndex('Student Name')
  const phoneIdx = columnIndex('Phone')

  if (nameIdx < 0) {
    errors.push('Missing required column "Student Name".')
  }

  if (phoneIdx < 0) {
    errors.push('Missing required column "Phone".')
  }

  if (dataRows.length === 0) {
    errors.push('No data rows found below the header.')
  }

  dataRows.forEach((cells, rowIndex) => {
    const lineNumber = rowIndex + 2
    const isBlank = cells.every((cell) => cell.trim() === '')
    if (isBlank) {
      return
    }

    const fullName = nameIdx >= 0 ? cells[nameIdx]?.trim() ?? '' : ''
    const phone = phoneIdx >= 0 ? cells[phoneIdx]?.trim() ?? '' : ''

    if (!fullName) {
      errors.push(`Row ${lineNumber}: student name is required.`)
      return
    }

    if (!phone) {
      errors.push(`Row ${lineNumber}: phone is required.`)
      return
    }

    rows.push({ full_name: fullName, phone })
  })

  return { rows, errors }
}
