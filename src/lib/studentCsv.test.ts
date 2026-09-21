import { describe, expect, it } from 'vitest'
import { buildPreviewStudentCsvTemplate, parsePreviewStudentCsv } from './studentCsv'

describe('parsePreviewStudentCsv', () => {
  it('parses preview student rows with name and phone only', () => {
    const result = parsePreviewStudentCsv(
      'Student Name,Phone\r\nAiden Tan,+60 12-345 6789\r\n',
    )

    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      { full_name: 'Aiden Tan', phone: '+60 12-345 6789' },
    ])
  })

  it('skips rows missing the phone number', () => {
    const result = parsePreviewStudentCsv('Student Name,Phone\r\nAiden Tan,\r\n')

    expect(result.rows).toEqual([])
    expect(result.errors).toContain('Row 2: phone is required.')
  })
})

describe('buildPreviewStudentCsvTemplate', () => {
  it('creates a CSV template with the required headers', () => {
    expect(buildPreviewStudentCsvTemplate().split(/\r?\n/)[0]).toBe(
      'Student Name,Phone',
    )
  })
})
