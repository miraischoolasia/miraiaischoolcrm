import { useEffect, useState } from 'react'
import { formatDateTime } from '../../lib/forms'
import { trafficSourceLabel } from '../../lib/formInsights'
import type { LeadFormSubmission } from '../../types/domain'

// Everything the parent wrote in the school's forms, newest form first, read in the panel itself.
export function FormAnswers({ leadId, load }: { leadId: number; load: (leadId: number) => Promise<LeadFormSubmission[]> }) {
  const [state, setState] = useState<
    { leadId: number; submissions: LeadFormSubmission[]; failed: boolean } | null
  >(null)

  useEffect(() => {
    let cancelled = false
    load(leadId)
      .then((submissions) => !cancelled && setState({ leadId, submissions, failed: false }))
      .catch(() => !cancelled && setState({ leadId, submissions: [], failed: true }))
    return () => {
      cancelled = true
    }
  }, [leadId, load])

  if (!state || state.leadId !== leadId) {
    return <p className="mt-2 text-slate-500">Loading their forms...</p>
  }
  if (state.failed) {
    return <p className="mt-2 text-red-600">Could not load their forms. Try again.</p>
  }
  if (state.submissions.length === 0) {
    return <p className="mt-2 text-slate-500">No form answers yet.</p>
  }

  return (
    <div aria-label="Form answers" className="mt-2 space-y-2 rounded-lg border border-pink-100 bg-[#fff8fc] p-2.5">
      {state.submissions.map((submission) => (
        <article key={submission.id} className="rounded-lg bg-white p-2.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <span className="font-semibold text-[#be185d]">{submission.formName}</span>
            <span className="text-slate-500">
              {formatDateTime(submission.createdAt)}
              {submission.wasExisting && ' · filled in again'}
            </span>
          </div>
          {submission.tracking && (
            <p className="mt-1 text-slate-500">
              Came from {trafficSourceLabel(submission.tracking)}
              {submission.tracking.campaign && ` · ${submission.tracking.campaign}`}
            </p>
          )}
          <dl className="mt-2 space-y-1.5">
            {submission.answers.map((answer) => (
              <div key={answer.id}>
                <dt className="font-semibold uppercase tracking-wide text-slate-500">{answer.label}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm text-slate-800">{answer.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  )
}
