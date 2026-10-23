// Supabase answers at most 1000 rows per request (the project's Max rows), so a table that can grow past that is read
// in pages. The first page also asks for the row count; with it the other pages are read at the same time instead of one
// after the other (a school with 6000 students waited for six requests in a row). Without a count it falls back to
// reading page after page until a short one comes.

export const READ_PAGE_SIZE = 1000

export type PageResult<T> = {
  data: T[] | null
  error: { code?: string; message?: string } | null
  count?: number | null
}

export type ReadAllResult<T> =
  | { data: T[]; error: null }
  | { data: null; error: NonNullable<PageResult<T>['error']> }

// `page(from, to, withCount)` reads rows from..to (inclusive) of one fixed ordering; the ordering must put every row in
// one place (end with the id), or a row could show on two pages or none.
export async function readAllRows<T>(
  page: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>,
  pageSize: number = READ_PAGE_SIZE,
): Promise<ReadAllResult<T>> {
  const first = await page(0, pageSize - 1, true)
  if (first.error) {
    return { data: null, error: first.error }
  }
  const rows: T[] = [...(first.data ?? [])]
  if (rows.length < pageSize) {
    return { data: rows, error: null }
  }

  const total = typeof first.count === 'number' ? first.count : null
  let next = pageSize
  if (total !== null && total > pageSize) {
    const starts: number[] = []
    for (let from = pageSize; from < total; from += pageSize) {
      starts.push(from)
    }
    const pages = await Promise.all(starts.map((from) => page(from, from + pageSize - 1, false)))
    for (const result of pages) {
      if (result.error) {
        return { data: null, error: result.error }
      }
      rows.push(...(result.data ?? []))
    }
    next = starts.length > 0 ? starts[starts.length - 1] + pageSize : pageSize
    // Rows added while reading: carry on after the last page that was asked for.
    if (rows.length < next) {
      return { data: rows, error: null }
    }
  }

  for (let from = next; ; from += pageSize) {
    const result = await page(from, from + pageSize - 1, false)
    if (result.error) {
      return { data: null, error: result.error }
    }
    rows.push(...(result.data ?? []))
    if ((result.data ?? []).length < pageSize) {
      return { data: rows, error: null }
    }
  }
}
