import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatwootClient } from '../../lib/chatwootClient'
import { copyOldChats, type CopyProgress } from '../../lib/inboxCopyBackfill'
import { fetchCopySummary, SETUP_MISSING, teamRepliesErrorMessage, type CopySummary } from '../../lib/teamReplyDaysApi'

// Admin only: copies the chats' history into the CRM's inbox copy and works out the kept days from it.
// Safe to press again: it carries on where it stopped and never copies a message twice.

export type InboxCopyPanelProps = {
  client: ChatwootClient | null
  // After a run, so the page reads the kept days again.
  onFinished: () => void
  // For tests.
  run?: typeof copyOldChats
  loadSummary?: typeof fetchCopySummary
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
  return `Done: ${number.format(progress.messages)} messages copied, ${number.format(progress.daysTotal)} days worked out${
    progress.chatsFailed > 0 ? `; ${progress.chatsFailed} chats could not be read (press again to retry them)` : ''
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

export function InboxCopyPanel({ client, onFinished, run = copyOldChats, loadSummary = fetchCopySummary }: InboxCopyPanelProps) {
  const [summary, setSummary] = useState<CopySummary | null>(null)
  const [progress, setProgress] = useState<CopyProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  // The copy's tables are not in this database yet: nothing to copy into.
  const [isMissing, setIsMissing] = useState(false)
  // Stops the run when asked or when the page closes; also keeps a second press from starting another.
  const stop = useRef(false)
  const running = useRef(false)

  const refreshSummary = useCallback(() => {
    loadSummary()
      .then((value) => {
        setSummary(value)
        setIsMissing(false)
      })
      .catch((failure) => {
        const message = teamRepliesErrorMessage(failure)
        setIsMissing(message === SETUP_MISSING)
        setError(message)
      })
  }, [loadSummary])

  useEffect(() => {
    refreshSummary()
    return () => {
      stop.current = true
    }
  }, [refreshSummary])

  async function start() {
    if (!client || running.current || isMissing) {
      return
    }
    running.current = true
    stop.current = false
    setIsRunning(true)
    setError(null)
    try {
      const result = await run({ client, onProgress: setProgress, cancelled: () => stop.current })
      setProgress(result)
    } catch (failure) {
      setError(teamRepliesErrorMessage(failure))
    } finally {
      running.current = false
      setIsRunning(false)
      refreshSummary()
      onFinished()
    }
  }

  return (
    <section aria-labelledby="inbox-copy-title" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="inbox-copy-title" className="text-sm font-semibold text-slate-900">
            Copy old chats
          </h3>
          <p className="text-sm text-slate-500">
            New messages are copied as they arrive. This reads the older ones from the inbox, then works out every day
            since the first message. It can take several minutes; you can stop and carry on later.
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
        <div className="flex shrink-0 gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={() => {
                stop.current = true
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            disabled={isRunning || !client || isMissing}
            onClick={() => void start()}
            className="rounded-xl bg-[#be185d] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#9d174d] disabled:opacity-50"
          >
            {isRunning ? 'Copying…' : summary && summary.copiedChats > 0 ? 'Carry on copying' : 'Copy old chats'}
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
            {!isRunning && progress.phase !== 'done' ? ' Stopped; press again to carry on.' : ''}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}
