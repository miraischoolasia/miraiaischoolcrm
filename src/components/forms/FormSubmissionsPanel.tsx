import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, DownloadSimple, MagnifyingGlass, Trash, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import {
  buildSubmissionsCsv,
  formatDateTime,
  getSubmissionColumns,
  summarizeAnswers,
} from '../../lib/forms'
import type { Form, FormSubmission } from '../../types/domain'

export const SUBMISSIONS_PAGE_SIZE = 25
const MAX_FORM_COLUMNS = 4

type FormSubmissionsPanelProps = {
  forms: Form[]
  submissions: FormSubmission[]
  isCapped: boolean
  deletingId: number | null
  onDelete: (submission: FormSubmission) => void
}

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function FormSubmissionsPanel({
  forms,
  submissions,
  isCapped,
  deletingId,
  onDelete,
}: FormSubmissionsPanelProps) {
  const [formFilter, setFormFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)

  const formNameById = useMemo(() => new Map(forms.map((form) => [form.id, form.name])), [forms])

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return submissions.filter((submission) => {
      if (formFilter !== 'all' && submission.formId !== formFilter) {
        return false
      }
      return (
        !term || submission.answers.some((answer) => answer.value.toLowerCase().includes(term))
      )
    })
  }, [submissions, formFilter, searchTerm])

  const pageCount = Math.max(1, Math.ceil(filtered.length / SUBMISSIONS_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * SUBMISSIONS_PAGE_SIZE
  const paged = filtered.slice(pageStart, pageStart + SUBMISSIONS_PAGE_SIZE)
  const open = submissions.find((submission) => submission.id === openId) ?? null

  // One form picked: a column per question. Otherwise a short summary.
  const columns = useMemo(
    () => (formFilter === 'all' ? [] : getSubmissionColumns(filtered).slice(0, MAX_FORM_COLUMNS)),
    [filtered, formFilter],
  )

  function exportCsv() {
    const name = formFilter === 'all' ? 'form-submissions' : (formNameById.get(formFilter) ?? 'form')
    const safe = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
    downloadCsv(`${safe || 'form'}-submissions.csv`, buildSubmissionsCsv(filtered, formNameById))
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value)
              setPage(1)
            }}
            placeholder="Search submissions..."
            aria-label="Search submissions"
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none sm:w-72"
          />
        </div>
        <select
          value={formFilter}
          aria-label="Filter by form"
          onChange={(event) => {
            setFormFilter(event.target.value)
            setPage(1)
          }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#fc0c97] focus:outline-none"
        >
          <option value="all">All forms</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto"
        >
          <DownloadSimple size={16} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">
          {submissions.length === 0
            ? 'No submissions yet. They show up here as soon as someone fills in a form.'
            : 'No submissions match.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table data-compact-table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-white text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              <tr>
                <th className="px-6 py-4">Submitted</th>
                {formFilter === 'all' ? (
                  <>
                    <th className="px-6 py-4">Form</th>
                    <th className="px-6 py-4">Answers</th>
                  </>
                ) : (
                  columns.map((column) => (
                    <th key={column.id} className="px-6 py-4">
                      {column.label}
                    </th>
                  ))
                )}
                <th className="px-6 py-4">Lead</th>
                <th className="px-6 py-4 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {paged.map((submission) => (
                <tr key={submission.id} className="align-top">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                    {formatDateTime(submission.createdAt)}
                  </td>
                  {formFilter === 'all' ? (
                    <>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formNameById.get(submission.formId) ?? 'Deleted form'}
                      </td>
                      <td className="max-w-md truncate px-6 py-4 text-sm text-slate-600">
                        {summarizeAnswers(submission) || '-'}
                      </td>
                    </>
                  ) : (
                    columns.map((column) => (
                      <td key={column.id} className="max-w-xs truncate px-6 py-4 text-sm text-slate-600">
                        {submission.answers.find((answer) => answer.id === column.id)?.value || '-'}
                      </td>
                    ))
                  )}
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {submission.leadId ? 'In Leads' : '-'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(submission.id)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 text-sm text-slate-600">
          <span>
            Showing {pageStart + 1}-{pageStart + paged.length} of {filtered.length}
            {isCapped && ' (newest only)'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <CaretLeft size={16} aria-hidden="true" />
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <CaretRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {open && (
        <ModalShell maxWidth="sm" onClose={() => setOpenId(null)}>
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-[#be185d]">
                  {formNameById.get(open.formId) ?? 'Deleted form'}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {formatDateTime(open.createdAt)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                aria-label="Close"
                className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div data-modal-body className="space-y-4 px-6 py-5">
            <dl className="space-y-3">
              {open.answers.map((answer) => (
                <div key={answer.id}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {answer.label}
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-800">
                    {answer.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-slate-500">
              {open.leadId ? 'A lead was created from this submission.' : 'No lead was created.'}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={deletingId === open.id}
                onClick={() => {
                  setOpenId(null)
                  onDelete(open)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                <Trash size={16} aria-hidden="true" />
                Delete submission
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
