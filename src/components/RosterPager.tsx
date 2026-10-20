import { CaretLeft, CaretRight } from '@phosphor-icons/react'

// Previous / next page under a class roster; nothing when it fits on one page.
export function RosterPager({
  page,
  pageCount,
  range,
  onPage,
}: {
  page: number
  pageCount: number
  range: string
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label="Student pages" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
      <span>{range}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <CaretLeft size={14} aria-hidden="true" />
          Previous
        </button>
        <span className="px-2">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page === pageCount}
          onClick={() => onPage(page + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Next
          <CaretRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
