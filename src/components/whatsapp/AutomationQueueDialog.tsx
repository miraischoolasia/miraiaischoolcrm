import { useMemo, useState } from 'react'
import { Lightning, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import {
  canSend,
  isBeingSent,
  isExpired,
  isStuck,
  DEFAULT_SEND_HOURS,
  autoSendTime,
  queueWhere,
  queueWho,
  roomLeft,
  willSendByItself,
  type AutomationSettings,
  type QueueItem,
  type SendHours,
} from '../../lib/automationQueue'
import type { ApproveResult, SendProgress } from '../../hooks/useAutomationQueue'

const NO_AUTO_FLOWS: ReadonlySet<string> = new Set()

type AutomationQueueDialogProps = {
  items: QueueItem[]
  // The flows ("flow_<id>") that send by themselves: their waiting messages need nobody.
  autoRuleKeys?: ReadonlySet<string>
  // The hours the sender program works (Kuala Lumpur time); a message waits for them when it is due outside.
  sendHours?: SendHours
  settings: AutomationSettings
  sentToday: number
  // Whoever can edit Leads may send; others can only read the queue.
  canEdit: boolean
  isLoading: boolean
  loadError: string | null
  progress: SendProgress | null
  nowMs?: number
  onClose: () => void
  // Each resolves to an error message, or null.
  onSaveMessage: (id: number, message: string) => Promise<string | null>
  onSkip: (ids: number[]) => Promise<string | null>
  onApprove: (entries: { item: QueueItem; message: string }[]) => Promise<ApproveResult>
}

const buttonClass =
  'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'

function formatDue(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function describeResult(result: ApproveResult) {
  const parts: string[] = []
  if (result.sent > 0) {
    parts.push(`${result.sent} ${result.sent === 1 ? 'message' : 'messages'} sent.`)
  }
  if (result.taken > 0) {
    parts.push(`${result.taken} had already been handled by someone else.`)
  }
  if (result.heldBack > 0) {
    parts.push(`${result.heldBack} left in the queue (the daily limit or time ran out).`)
  }
  if (result.failure) {
    parts.push(`Stopped: ${result.failure} The rest are still waiting.`)
  }
  return parts.join(' ') || 'Nothing was sent.'
}

// The messages the automations want to send. Nothing leaves until a person ticks it here.
export function AutomationQueueDialog({
  items,
  autoRuleKeys = NO_AUTO_FLOWS,
  sendHours = DEFAULT_SEND_HOURS,
  settings,
  sentToday,
  canEdit,
  isLoading,
  loadError,
  progress,
  nowMs,
  onClose,
  onSaveMessage,
  onSkip,
  onApprove,
}: AutomationQueueDialogProps) {
  const now = nowMs ?? Date.now()
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [edits, setEdits] = useState<Map<number, string>>(new Map())
  const [notice, setNotice] = useState<{
    text: string
    isError: boolean
  } | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  const textOf = (item: QueueItem) => edits.get(item.id) ?? item.message
  // The messages of a flow that sends by itself are only shown here; the sender program sends them at
  // the time written on them. Everything else waits for a person.
  const autoItems = useMemo(
    () => items.filter((item) => willSendByItself(item, autoRuleKeys, now)),
    [items, autoRuleKeys, now],
  )
  const waitingItems = useMemo(
    () => items.filter((item) => !willSendByItself(item, autoRuleKeys, now)),
    [items, autoRuleKeys, now],
  )
  const sendable = useMemo(() => waitingItems.filter((item) => canSend(item, now)), [waitingItems, now])
  const room = roomLeft(settings, sentToday)
  const chosen = items.filter((item) => picked.has(item.id) && canSend(item, now))
  const overLimit = chosen.length > room

  function toggle(id: number) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function saveEdit(item: QueueItem) {
    const text = edits.get(item.id)
    if (text === undefined || text === item.message || text.trim() === '') {
      return
    }
    const problem = await onSaveMessage(item.id, text.trim())
    if (problem) {
      setNotice({ text: problem, isError: true })
    }
  }

  async function approve() {
    setIsWorking(true)
    setNotice(null)
    const result = await onApprove(chosen.map((item) => ({ item, message: textOf(item) })))
    setIsWorking(false)
    setPicked(new Set())
    setEdits(new Map())
    setNotice({
      text: describeResult(result),
      isError: result.failure !== null,
    })
  }

  async function skip() {
    setIsWorking(true)
    setNotice(null)
    const ids = items.filter((item) => picked.has(item.id)).map((item) => item.id)
    const problem = await onSkip(ids)
    setIsWorking(false)
    setPicked(new Set())
    setNotice({
      text: problem ?? `${ids.length} skipped. They will not be sent.`,
      isError: problem !== null,
    })
  }

  function renderItem(item: QueueItem, auto: boolean) {
                  const sendableNow = canSend(item, now)
                  const stuck = isStuck(item, now)
                  return (
                    <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${queueWho(item)}`}
                          checked={picked.has(item.id)}
                          disabled={!canEdit || isWorking || (!sendableNow && item.status !== 'sending')}
                          onChange={() => toggle(item.id)}
                          className="mt-1 h-4 w-4 accent-[#fc0c97]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">{queueWho(item)}</span>
                            {item.childName && <span className="text-sm text-slate-500">· {item.childName}</span>}
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {item.ruleName}
                            </span>
                            {item.kind === 'ghl_workflow' && (
                              <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                                Button message
                              </span>
                            )}
                            {item.status === 'failed' && (
                              <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                Failed
                              </span>
                            )}
                            {isExpired(item, now) && (
                              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                Too late to send
                              </span>
                            )}
                            {isBeingSent(item, now) && (
                              <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                                Being sent
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {queueWhere(item)} · for {formatDue(item.dueAt)}
                          </p>
                          {item.kind === 'ghl_workflow' && (
                            <p className="mt-1 text-xs text-violet-800">
                              Starts a GoHighLevel button message. It goes out by itself, not from this window.
                            </p>
                          )}
                          {auto && (
                            <p className="mt-1 text-xs font-medium text-emerald-800">
                              {settings.paused
                                ? 'Waiting: automations are paused. It goes out by itself when they are switched on.'
                                : `Will send by itself at ${formatDue(new Date(autoSendTime(item, sendHours, now)).toISOString())}. No need to approve it.`}
                              {!settings.paused && autoSendTime(item, sendHours, now) > Math.max(Date.parse(item.dueAt), now)
                                ? ` It is outside the sending hours (${sendHours.from}:00 to ${sendHours.until}:00), so it waits for them.`
                                : ''}
                            </p>
                          )}
                          {item.mediaUrl && (
                            <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="mt-2 block w-fit">
                              <img
                                src={item.mediaUrl}
                                alt="Picture sent with this message"
                                className="max-h-24 max-w-[9rem] rounded-lg border border-slate-200"
                              />
                            </a>
                          )}
                          <textarea
                            value={textOf(item)}
                            disabled={!canEdit || isWorking || !sendableNow}
                            aria-label={`Message to ${queueWho(item)}`}
                            rows={3}
                            onChange={(event) =>
                              setEdits((current) => new Map(current).set(item.id, event.target.value))
                            }
                            onBlur={() => void saveEdit(item)}
                            className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50"
                          />
                          {item.autoBlocked && item.status === 'pending' && (
                            <p className="mt-1 text-xs text-amber-800">
                              Not sent by itself: {item.autoBlocked} Send it from here if it is fine.
                            </p>
                          )}
                          {item.error && item.status === 'failed' && (
                            <p className="mt-1 text-xs text-red-700">Last try: {item.error}</p>
                          )}
                          {stuck && (
                            <p className="mt-1 text-xs text-amber-800">
                              This one was being sent when a window closed. Check the chat first, because it may have
                              gone out already.
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  )
  }

  return (
    <ModalShell maxWidth="760" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Lightning size={20} weight="fill" className="text-[#fc0c97]" aria-hidden="true" />
            Automations
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Messages waiting for you. Nothing is sent until you approve it here, except the flows that send by
            themselves.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
        >
          <X size={16} />
        </button>
      </div>

      <>
        <div data-modal-body className="p-0!">
          <div className="space-y-3 px-6 py-4">
            <p className="text-xs text-slate-500">
              Sent today {sentToday} of {settings.dailyCap} · {settings.gapSeconds} seconds between messages
            </p>
            {settings.paused && (
              <p role="status" className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
                Automations are paused, so no new messages are being added. The ones below can still be sent.
              </p>
            )}
            {!canEdit && (
              <p className="rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-600">
                You can read these. Only people who can edit Leads can send or skip them.
              </p>
            )}
            {loadError && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {loadError}
              </p>
            )}
            {notice && (
              <p
                role={notice.isError ? 'alert' : 'status'}
                className={cn(
                  'rounded-xl px-4 py-3 text-sm',
                  notice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800',
                )}
              >
                {notice.text}
              </p>
            )}
            {progress && (
              <p role="status" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {progress.waitingSeconds > 0
                  ? `Sent ${progress.done} of ${progress.total}. Waiting ${progress.waitingSeconds} seconds before the next one…`
                  : `Sending ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
              </p>
            )}

            {isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <p className="font-semibold text-slate-900">All caught up</p>
                <p className="mt-1 text-sm text-slate-500">Nothing is waiting for approval.</p>
              </div>
            ) : (
              <>
                {waitingItems.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="font-semibold text-slate-900">Nothing needs your approval</p>
                    <p className="mt-1 text-sm text-slate-500">The messages below go out by themselves.</p>
                  </div>
                ) : (
                  <section aria-label="Needs your approval" className="space-y-2">
                    {autoItems.length > 0 && (
                      <h3 className="rounded-md bg-[#fff1f8] px-2 py-1 text-xs font-bold uppercase tracking-wide text-[#be185d]">
                        Needs your approval ({waitingItems.length})
                      </h3>
                    )}
                    <ul className="space-y-2">{waitingItems.map((item) => renderItem(item, false))}</ul>
                  </section>
                )}
                {autoItems.length > 0 && (
                  <section aria-label="Will send by itself" className="space-y-2">
                    <h3 className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
                      Will send by itself ({autoItems.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      These flows have “Send by itself” ticked, so nobody needs to approve them. Each goes out at the
                      time shown. Send one from here only if it should go now.
                    </p>
                    <ul className="space-y-2">{autoItems.map((item) => renderItem(item, true))}</ul>
                  </section>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-6 py-3">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <button
              type="button"
              disabled={!canEdit || isWorking || sendable.length === 0}
              onClick={() =>
                setPicked((current) =>
                  current.size === sendable.length ? new Set() : new Set(sendable.map((item) => item.id)),
                )
              }
              className="font-semibold text-slate-700 hover:underline disabled:opacity-50"
            >
              {picked.size === sendable.length && sendable.length > 0
                ? 'Clear selection'
                : `Select all (${sendable.length})`}
            </button>
            {overLimit && (
              <span role="status" className="text-xs text-amber-800">
                Only {room} more can go out today. The first {room} will be sent.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canEdit || isWorking || picked.size === 0}
              onClick={() => void skip()}
              className={buttonClass}
            >
              Skip selected
            </button>
            <button
              type="button"
              disabled={!canEdit || isWorking || chosen.length === 0 || room === 0}
              onClick={() => void approve()}
              className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
            >
              {isWorking ? 'Sending…' : `Approve and send (${Math.min(chosen.length, room)})`}
            </button>
          </div>
        </div>
      </>
    </ModalShell>
  )
}
