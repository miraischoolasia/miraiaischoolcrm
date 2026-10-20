import { describe, expect, it } from 'vitest'
import { pageSlice, ROSTER_PAGE_SIZE } from './paging'

const names = Array.from({ length: 45 }, (_, index) => `Student ${index + 1}`)

describe('pageSlice', () => {
  it('shows 20 at a time', () => {
    expect(ROSTER_PAGE_SIZE).toBe(20)
    const first = pageSlice(names, 1)
    expect(first.items).toHaveLength(20)
    expect(first.items[0]).toBe('Student 1')
    expect(first.pageCount).toBe(3)
    expect(first.range).toBe('1–20 of 45')
  })

  it('the last page has the rest', () => {
    const last = pageSlice(names, 3)
    expect(last.items).toEqual(['Student 41', 'Student 42', 'Student 43', 'Student 44', 'Student 45'])
    expect(last.range).toBe('41–45 of 45')
  })

  it('keeps the page inside the list', () => {
    expect(pageSlice(names, 9).page).toBe(3)
    expect(pageSlice(names, 0).page).toBe(1)
    expect(pageSlice(names.slice(0, 5), 2)).toMatchObject({ page: 1, pageCount: 1, items: names.slice(0, 5) })
  })

  it('an empty list is one empty page', () => {
    expect(pageSlice([], 1)).toEqual({ items: [], page: 1, pageCount: 1, range: '' })
  })
})
