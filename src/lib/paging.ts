// A class roster is shown 20 students at a time.
export const ROSTER_PAGE_SIZE = 20

// One page of a list: the page asked for, kept between 1 and the last page.
export function pageSlice<T>(items: T[], page: number, size = ROSTER_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * size
  return {
    items: items.slice(start, start + size),
    page: current,
    pageCount,
    // "21–40 of 133", or "" when the list is empty.
    range: items.length === 0 ? '' : `${start + 1}–${Math.min(start + size, items.length)} of ${items.length}`,
  }
}
