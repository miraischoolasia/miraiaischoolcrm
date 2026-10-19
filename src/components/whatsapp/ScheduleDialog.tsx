import { useEffect, useMemo, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { ModalShell } from '../ModalShell'
import type { QuickReply } from '../../lib/quickReplies'
import {
  changeSchedule,
  listFlowChoices,
  pictureUrlFor,
  scheduleError,
  scheduleFlow,
  scheduleMessage,
  signedPicture,
  toLocalInput,
  type ChatSchedule,
  type FlowChoice,
  type ScheduleTarget,
} from '../../lib/chatSchedules'

type Mode = 'message' | 'flow'

export type ScheduleApi = {
  scheduleMessage: typeof scheduleMessage
  scheduleFlow: typeof scheduleFlow
  changeSchedule: typeof changeSchedule
  listFlowChoices: typeof listFlowChoices
  pictureUrlFor: typeof pictureUrlFor
  signedPicture: typeof signedPicture
}

const defaultApi: ScheduleApi = { scheduleMessage, scheduleFlow, changeSchedule, listFlowChoices, pictureUrlFor, signedPicture }

// The chat's "+" > Automation: send this person a message at a time, or start one of the school's flows for them
// at a time. Editing one that is still waiting uses the same window.
export function ScheduleDialog({
  target,
  quickReplies,
  editing = null,
  onClose,
  onSaved,
  api = defaultApi,
  now = new Date(),
}: {
  target: ScheduleTarget
  quickReplies: QuickReply[]
  editing?: ChatSchedule | null
  onClose: () => void
  onSaved: () => void
  api?: ScheduleApi
  now?: Date
}) {
  const [mode, setMode] = useState<Mode>(editing?.kind ?? 'message')
  const [when, setWhen] = useState(() => toLocalInput(editing ? new Date(editing.runAt) : new Date(now.getTime() + 60 * 60_000)))
  const [message, setMessage] = useState(editing?.message ?? '')
  const [picture, setPicture] = useState<File | null>(null)
  // A picture already chosen: a quick reply's (its file path) or the one kept with the schedule (its address).
  const [quickPicture, setQuickPicture] = useState<string | null>(null)
  const [keptPicture, setKeptPicture] = useState<string | null>(editing?.mediaUrl ?? null)
  const [flowId, setFlowId] = useState<number | null>(editing?.flowId ?? null)
  const [flows, setFlows] = useState<FlowChoice[] | null>(null)
  const [cancelOnReply, setCancelOnReply] = useState(editing?.cancelOnReply ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'flow' || flows !== null) {
      return
    }
    api.listFlowChoices().then(setFlows).catch((failure) => {
      setFlows([])
      setError(scheduleError(failure, "Couldn't load the flows."))
    })
  }, [mode, flows, api])

  const usable = useMemo(() => quickReplies.filter((reply) => reply.isActive), [quickReplies])

  function useQuickReply(id: number) {
    const reply = usable.find((entry) => entry.id === id)
    if (!reply) {
      return
    }
    const texts = reply.steps.flatMap((step) => (step.kind === 'text' ? [step.text] : []))
    const media = reply.steps.find((step) => step.kind === 'media')
    setMessage(texts.join('\n\n'))
    setPicture(null)
    setKeptPicture(null)
    setQuickPicture(media && media.kind === 'media' && media.media.type.startsWith('image/') ? media.media.path : null)
  }

  async function save() {
    const runAt = new Date(when)
    if (Number.isNaN(runAt.getTime())) {
      setError('Pick a day and time.')
      return
    }
    if (runAt.getTime() < Date.now() - 60_000) {
      setError('Pick a time that has not passed.')
      return
    }
    setError(null)
    setIsSaving(true)
    try {
      if (mode === 'flow') {
        if (flowId === null) {
          setError('Pick a flow.')
          return
        }
        if (editing) {
          await api.changeSchedule(editing.id, { message: null, mediaUrl: null, runAt, cancelOnReply })
        } else {
          await api.scheduleFlow(target, { flowId, runAt, cancelOnReply })
        }
      } else {
        if (!message.trim()) {
          setError('Write the message (a picture goes with it).')
          return
        }
        const mediaUrl = picture
          ? await api.pictureUrlFor(picture, runAt)
          : quickPicture
            ? await api.signedPicture(quickPicture, runAt)
            : keptPicture
        if (editing) {
          await api.changeSchedule(editing.id, { message: message.trim(), mediaUrl, runAt, cancelOnReply })
        } else {
          await api.scheduleMessage(target, { message: message.trim(), mediaUrl, runAt, cancelOnReply })
        }
      }
      onSaved()
      onClose()
    } catch (failure) {
      setError(scheduleError(failure))
    } finally {
      setIsSaving(false)
    }
  }

  const pictureName = picture?.name ?? (quickPicture ? 'From the quick reply' : keptPicture ? 'Picture kept from before' : null)

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{editing ? 'Change what is scheduled' : 'Automation for this chat'}</h2>
          <p className="text-sm text-slate-500">For {target.parentName || 'this person'} only.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <X size={16} />
        </button>
      </div>
      <div data-modal-body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6">
        {!editing && (
          <div role="radiogroup" aria-label="What to do" className="flex gap-2">
            {(
              [
                ['message', 'Send a message'],
                ['flow', 'Start a flow'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                onClick={() => setMode(key)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm font-semibold',
                  mode === key ? 'border-[#fbcfe8] bg-[#fff1f8] text-[#be185d]' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">{mode === 'flow' ? 'Start at' : 'Send at'}</span>
          <input
            type="datetime-local"
            value={when}
            min={toLocalInput(now)}
            onChange={(event) => setWhen(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        {mode === 'message' ? (
          <>
            {usable.length > 0 && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Start from a quick reply (optional)</span>
                <select
                  defaultValue=""
                  onChange={(event) => event.target.value && useQuickReply(Number(event.target.value))}
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Choose one…</option>
                  {usable.map((reply) => (
                    <option key={reply.id} value={reply.id}>
                      {reply.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Message</span>
              <textarea
                value={message}
                rows={4}
                maxLength={4000}
                onChange={(event) => setMessage(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Picture (optional)</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Picture"
                  onChange={(event) => {
                    setPicture(event.target.files?.[0] ?? null)
                    setQuickPicture(null)
                    setKeptPicture(null)
                  }}
                  className="block text-sm"
                />
                {pictureName && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {pictureName}
                    <button
                      type="button"
                      aria-label="Remove the picture"
                      onClick={() => {
                        setPicture(null)
                        setQuickPicture(null)
                        setKeptPicture(null)
                      }}
                      className="rounded-full p-0.5 hover:bg-slate-200 min-h-0!"
                    >
                      <X size={10} />
                    </button>
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Flow</span>
            <select
              aria-label="Flow"
              value={flowId ?? ''}
              disabled={Boolean(editing)}
              onChange={(event) => setFlowId(event.target.value ? Number(event.target.value) : null)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">{flows === null ? 'Loading…' : 'Choose a flow…'}</option>
              {(flows ?? []).map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              The flow runs for this person as if its trigger happened at this time: its messages that come after
              go out as set in the flow (by itself, or after approval).
            </span>
          </label>
        )}

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={cancelOnReply} onChange={(event) => setCancelOnReply(event.target.checked)} className="mt-0.5" />
          <span>Cancel it if the parent replies before then</span>
        </label>
        {mode === 'message' && (
          <p className="text-xs text-slate-500">
            It goes out by itself through the school&apos;s automatic sender, within the sending hours and limits set in Automations.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : editing ? 'Save' : 'Schedule'}
        </button>
      </div>
    </ModalShell>
  )
}
