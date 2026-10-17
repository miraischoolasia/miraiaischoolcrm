import { useEffect, useState } from 'react'
import { Copy, Sparkle } from '@phosphor-icons/react'
import { formatDate } from '../domain/studentStatus'
import { cn } from '../lib/cn'
import {
  fetchLatestReports,
  reportAsText,
  requestReport,
  setReportShared,
  type Audience,
  type SavedReport,
} from '../lib/studentReports'

const audienceLabels: Record<Audience, string> = { teacher: 'For the teacher', parent: 'For the parent' }

// The latest AI analysis of a student, for the teacher or the parent, and a
// button to make a fresh one from the student's latest lessons.
export function AiReportCard({ studentId }: { studentId: number }) {
  const [audience, setAudience] = useState<Audience>('teacher')
  const [reports, setReports] = useState<Partial<Record<Audience, SavedReport>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchLatestReports(studentId)
      .then((next) => !cancelled && setReports(next))
      .catch((loadError) => !cancelled && setError(loadError instanceof Error ? loadError.message : 'Failed to load.'))
    return () => {
      cancelled = true
    }
  }, [studentId])

  const current = reports?.[audience] ?? null

  async function analyse() {
    setBusy(true)
    setError(null)
    setCopied(false)
    const result = await requestReport(studentId, audience)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setReports((existing) => ({ ...(existing ?? {}), [audience]: result.saved }))
  }

  async function share(shared: boolean) {
    if (!current?.id) return
    setBusy(true)
    setError(null)
    const result = await setReportShared(current.id, shared)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setReports((existing) => ({ ...(existing ?? {}), parent: { ...current, sharedAt: result.sharedAt } }))
  }

  async function copy() {
    if (!current) return
    try {
      await navigator.clipboard.writeText(reportAsText(current.report, audience))
      setCopied(true)
    } catch {
      setError('Could not copy. Select the text instead.')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkle size={18} weight="fill" className="text-[#fc0c97]" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-slate-900">AI analysis</h3>
        </div>
        <div role="tablist" className="flex gap-1.5">
          {(['teacher', 'parent'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={audience === key}
              onClick={() => {
                setAudience(key)
                setCopied(false)
              }}
              className={cn(
                'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                audience === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {audienceLabels[key]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {reports === null && !error && <p className="mt-4 text-sm text-slate-500">Loading…</p>}

      {reports !== null && !current && !busy && (
        <p className="mt-4 text-sm text-slate-500">
          No analysis yet. It reads the student's latest lessons: attendance, ratings, notes and points (as set in Class
          Settings).
        </p>
      )}

      {busy && <p className="mt-4 text-sm font-semibold text-slate-600">Reading the lessons and writing the analysis…</p>}

      {current && !busy && (
        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <p className="text-xs text-slate-400">
            {formatDate(current.createdAt.slice(0, 10))} · from {current.lessonCount}{' '}
            {current.lessonCount === 1 ? 'lesson' : 'lessons'}
          </p>
          {audience === 'parent' && current.report.message ? (
            <p className="whitespace-pre-wrap rounded-xl bg-emerald-50 px-4 py-3 text-slate-800">{current.report.message}</p>
          ) : (
            <p>{current.report.summary}</p>
          )}
          {audience === 'teacher' && (
            <>
              <ReportList title="Strengths" items={current.report.strengths} />
              <ReportList title="To work on" items={current.report.needs} />
              <ReportList title="Next lesson" items={current.report.next_steps} />
              {current.report.message && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-slate-800">Say to the student: “{current.report.message}”</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {current?.id && audience === 'parent' && !busy && (
          <>
            {current.sharedAt && (
              <span className="text-xs font-semibold text-emerald-700">
                In the student app since {formatDate(current.sharedAt.slice(0, 10))}
              </span>
            )}
            <button
              type="button"
              onClick={() => void share(!current.sharedAt)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {current.sharedAt ? 'Stop showing in the app' : 'Show in the student app'}
            </button>
          </>
        )}
        {current && !busy && (
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Copy size={14} aria-hidden="true" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void analyse()}
          className="rounded-xl bg-[#fc0c97] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          {current ? 'Analyse again' : 'Analyse'}
        </button>
      </div>
    </section>
  )
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
