import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ChatwootClient } from '../../lib/chatwootClient'
import { copyOldChats, workOutAllDays, type CopyProgress } from '../../lib/inboxCopyBackfill'
import { fetchCopySummary, SETUP_MISSING, teamRepliesErrorMessage, type CopySummary } from '../../lib/teamReplyDaysApi'

// Admin only: copies the chats' history into the CRM's inbox copy and works out the kept days from it.
// Safe to press again: it carries on where it stopped and never copies a message twice.
//
// The run belongs to the open CRM, not to this page: going to another page and back keeps it going and shows
// where it is (closing the browser tab, or Stop, ends it). Leaving the page used to stop it before the days
// were worked out.

export type InboxCopyPanelProps = {
  client: ChatwootClient | null
  // After a run, so the page reads the kept days again.
  onFinished: () => void
  // For tests.
  run?: typeof copyOldChats
  runDays?: typeof workOutAllDays
  loadSummary?: typeof fetchCopySummary
}

type Job = {
  kind: 'copy' | 'days' | null
  running: boolean
  stop: boolean
  progress: CopyProgress | null
  error: string | null
  // Bumped on every change, so a page that opens again shows the newest state.
  version: number
}

let job: Job = { kind: null, running: false, stop: false, progress: null, error: null, version: 0 }
const listeners = new Set<() => void>()
const finishListeners = new Set<() => void>()

function update(change: Partial<Job>) {
  job = { ...job, ...change, version: job.version + 1 }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Closing the tab while a run is going would cut it off: the browser asks first.
function warnBeforeClosing(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}

async function startJob(kind: 'copy' | 'days', work: (cancelled: () => boolean, onProgress: (p: CopyProgress) => void) => Promise<CopyProgress>) {
  if (job.running) {
    return
  }
  update({ kind, running: true, stop: false, error: null, progress: null })
  window.addEventListener('beforeunload', warnBeforeClosing)
  try {
    const result = await work(
      () => job.stop,
      (progress) => update({ progress }),
    )
    update({ progress: result })
  } catch (failure) {
    update({ error: teamRepliesErrorMessage(failure) })
  } finally {
    window.removeEventListener('beforeunload', warnBeforeClosing)
    update({ running: false })
    finishListeners.forEach((listener) => listener())
  }
}

// For tests: forget the last run.
export function resetCopyJob() {
  job = { kind: null, running: false, stop: false, progress: null, error: null, version: 0 }
  listeners.forEach((listener) => listener())
}

const number = new Intl.NumberFormat('en-US')
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function describe(progress: CopyProgress) {
  if (progress.phase === 'listing') {
    return `Listing the chats… ${number.format(progress.chatsTotal)} found`
  }
  if (progress.phase === 'chats') {
    return `Copying chats: ${number.format(progress.chatsDone)} of ${number.format(progress.chatsTotal)} (${number.format(progress.messages)} messages)`
  }
  if (progress.phase === 'days') {
    return `Working out the days: ${number.format(progress.daysDone)} of ${number.format(progress.daysTotal)}`
  }
  return `Done: ${progress.messages > 0 ? `${number.format(progress.messages)} messages copied, ` : ''}${number.format(progress.daysTotal)} days worked out${
    progress.chatsFailed > 0 ? `; ${progress.chatsFailed} chats could not be read (press Carry on copying to retry them)` : ''
  }.`
}

function share(progress: CopyProgress) {
  if (progress.phase === 'chats' && progress.chatsTotal > 0) {
    return progress.chatsDone / progress.chatsTotal
  }
  if (progress.phase === 'days' && progress.daysTotal > 0) {
    return progress.daysDone / progress.daysTotal
  }
  return progress.phase === 'done' ? 1 : 0
}

export function InboxCopyPanel({
  client,
  onFinished,
  run = copyOldChats,
  runDays = workOutAllDays,
  loadSummary = fetchCopySummary,
}: InboxCopyPanelProps) {
  const current = useSyncExternalStore(subscribe, () => job)
  const [summary, setSummary] = useState<CopySummary | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  // The copy's tables are not in this database yet: nothing to copy into.
  const [isMissing, setIsMissing] = useState(false)

  const refreshSummary = useCallback(() => {
    loadSummary()
      .then((value) => {
        setSummary(value)
        setIsMissing(false)
        setSummaryError(null)
      })
      .catch((failure) => {
        const message = teamRepliesErrorMessage(failure)
        setIsMissing(message === SETUP_MISSING)
        setSummaryError(message)
      })
  }, [loadSummary])

  useEffect(() => {
    refreshSummary()
  }, [refreshSummary])

  // When a run ends, also while this page is open again after leaving it.
  useEffect(() => {
    const finished = () => {
      refreshSummary()
      onFinished()
    }
    finishListeners.add(finished)
    return () => {
      finishListeners.delete(finished)
    }
  }, [refreshSummary, onFinished])

  const { running, progress } = current
  const error = current.error ?? summaryError
  const hasCopy = Boolean(summary && summary.messages > 0)

  return (
    <section aria-labelledby="inbox-copy-title" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="inbox-copy-title" className="text-sm font-semibold text-slate-900">
            Copy old chats
          </h3>
          <p className="text-sm text-slate-500">
            New messages are copied as they arrive. This reads the older ones from the inbox, then works out every day
            since the first message. It can take several minutes and keeps going on other pages of the CRM; you can stop
            and carry on later. "Work out the days" only counts the days again from what is already copied.
          </p>
          {summary && (
            <p className="mt-1 text-xs text-slate-500">
              In the copy: {number.format(summary.messages)} messages in {number.format(summary.chats)} chats
              {summary.firstMessageAt ? `, from ${shortDate.format(new Date(summary.firstMessageAt))}` : ''};{' '}
              {number.format(summary.copiedChats)} chats read completely
              {summary.chatsToCopy > 0 && (
                <strong className="text-amber-700">; {number.format(summary.chatsToCopy)} to read again</strong>
              )}
              .
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => update({ stop: true })}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Stop
            </button>
          ) : (
            hasCopy && (
              <button
                type="button"
                disabled={isMissing}
                onClick={() => void startJob('days', (cancelled, onProgress) => runDays({ onProgress, cancelled }))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Work out the days
              </button>
            )
          )}
          <button
            type="button"
            disabled={running || !client || isMissing}
            onClick={() => void startJob('copy', (cancelled, onProgress) => run({ client: client!, onProgress, cancelled }))}
            className="rounded-xl bg-[#be185d] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#9d174d] disabled:opacity-50"
          >
            {running
              ? current.kind === 'days'
                ? 'Working out…'
                : 'Copying…'
              : summary && summary.copiedChats > 0
                ? 'Carry on copying'
                : 'Copy old chats'}
          </button>
        </div>
      </div>
      {!client && <p className="mt-2 text-xs text-slate-500">The inbox is not connected, so the old chats can't be read.</p>}
      {progress && (
        <div className="mt-3" role="status">
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label="Copy progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share(progress) * 100)}
          >
            <div className="h-full rounded-full bg-[#db2777] transition-all" style={{ width: `${Math.round(share(progress) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            {describe(progress)}
            {!running && progress.phase !== 'done' ? ' Stopped before the end; press again to carry on.' : ''}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
