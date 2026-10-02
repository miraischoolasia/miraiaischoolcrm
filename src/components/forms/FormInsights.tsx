import { useMemo } from 'react'
import { computePageFunnel, summarizeSources } from '../../lib/formInsights'
import type { Form, FormSubmission } from '../../types/domain'

const MAX_SOURCE_ROWS = 5

// For one form: where its submissions came from, and for a form with several
// pages, how many people reach each page and where they give up.
export function FormInsights({
  form,
  submissions,
}: {
  form: Form
  // Every submission of this form, finished or not.
  submissions: FormSubmission[]
}) {
  const { pages } = form.settings
  const funnel = useMemo(
    () =>
      pages.length > 1 ? computePageFunnel(pages, form.fields, submissions, form.viewCount) : [],
    [pages, form.fields, form.viewCount, submissions],
  )
  const sources = useMemo(() => summarizeSources(submissions), [submissions])
  const finished = sources.reduce((total, row) => total + row.count, 0)
  const topReached = funnel[0]?.reached ?? 0

  if (funnel.length === 0 && sources.length === 0) {
    return null
  }

  return (
    <div
      aria-label={`Insights for ${form.name}`}
      role="region"
      className="grid gap-6 border-b border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2"
    >
      {funnel.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Where people stop</h3>
          <ol className="mt-3 space-y-3">
            {funnel.map((row) => (
              <li key={row.pageId}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">{row.label}</span>
                  <span className="text-slate-600">
                    {row.reached} reached
                    {row.stoppedHere > 0 && (
                      <span className="text-amber-700"> · {row.stoppedHere} stopped here</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-pink-100" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-[#fc0c97]"
                    style={{ width: `${topReached > 0 ? Math.round((row.reached / topReached) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            Page 1 also counts people who opened the form and left without pressing Next.
          </p>
        </section>
      )}

      {sources.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Where submissions came from</h3>
          <ul className="mt-3 space-y-2">
            {sources.slice(0, MAX_SOURCE_ROWS).map((row) => (
              <li
                key={`${row.source}|${row.campaign}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-slate-800">
                  {row.source}
                  {row.campaign && <span className="text-slate-500"> · {row.campaign}</span>}
                </span>
                <span className="shrink-0 text-slate-600">
                  {row.count} ({Math.round((row.count / finished) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
          {sources.length > MAX_SOURCE_ROWS && (
            <p className="mt-1 text-xs text-slate-500">
              and {sources.length - MAX_SOURCE_ROWS} more (all of them are in the CSV)
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Add ?utm_source=facebook&amp;utm_campaign=name to the link to tell campaigns apart.
            "Direct" means nothing told us.
          </p>
        </section>
      )}
    </div>
  )
}
