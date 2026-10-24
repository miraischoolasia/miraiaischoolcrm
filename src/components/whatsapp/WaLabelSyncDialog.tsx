import { useCallback, useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { fetchInboxChannels, type InboxChannel } from '../../lib/inboxChannels'
import {
  WA_LABEL_COLORS,
  fetchLatestWaLabelRuns,
  fetchWaLabelBudget,
  fetchWaLabelSync,
  saveWaLabelSync,
  type WaLabelBudget,
  type WaLabelSyncRun,
  type WaLabelSyncSettings,
} from '../../lib/waLabelSync'
import type { LeadOption } from '../../types/domain'

export type WaLabelSyncApi = {
  fetchSettings: typeof fetchWaLabelSync
  save: typeof saveWaLabelSync
  fetchBudget: typeof fetchWaLabelBudget
  fetchRuns: typeof fetchLatestWaLabelRuns
  fetchNumbers: () => Promise<InboxChannel[]>
}

const realApi: WaLabelSyncApi = {
  fetchSettings: fetchWaLabelSync,
  save: saveWaLabelSync,
  fetchBudget: fetchWaLabelBudget,
  fetchRuns: fetchLatestWaLabelRuns,
  fetchNumbers: fetchInboxChannels,
}

const fieldClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'

function whenText(iso: string) {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={Number.isNaN(value) ? '' : value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className={fieldClass}
      />
    </label>
  )
}

// The last night's report of a number: what was done, and what did not fit.
function RunReport({ run }: { run: WaLabelSyncRun | undefined }) {
  if (!run) {
    return <p className="text-xs text-slate-500">No night has run on this number yet.</p>
  }
  return (
    <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <p className="font-semibold text-slate-700">
        Last run {whenText(run.finishedAt)}
        {run.dryRun ? ' (test run, nothing changed on the phone)' : ''}
      </p>
      <p>
        {run.chatsDone} of {run.chatsPlanned} chats done · {run.labelsAdded} labels put on · {run.labelsRemoved} taken off
        {run.chatsFailed > 0 ? ` · ${run.chatsFailed} failed` : ''}
        {run.chatsNoNumber > 0 ? ` · ${run.chatsNoNumber} without a number` : ''}
      </p>
      {run.tagsLeftOut.length > 0 && <p>Tags left out: {run.tagsLeftOut.join(', ')}</p>}
      {run.labelsMade.length > 0 && <p>New labels made on the phone: {run.labelsMade.join(', ')}</p>}
      {run.labelsMissing.length > 0 && <p className="text-amber-700">Labels it could not make: {run.labelsMissing.join(', ')}</p>}
      {run.stopped && <p className="text-amber-700">Stopped early: {run.stopped}</p>}
    </div>
  )
}

function Chip({ name, color, muted }: { name: string; color?: string | null; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
        muted ? 'border-dashed border-slate-300 bg-slate-50 text-slate-500' : 'border-slate-200 bg-white text-slate-700'
      }`}
    >
      {color ? <span className="size-2 rounded-full" style={{ backgroundColor: color }} /> : null}
      {name}
    </span>
  )
}

function NumberCard({
  number,
  budget,
  run,
  tags,
  ticked,
  onTick,
}: {
  number: InboxChannel
  budget: WaLabelBudget | null | undefined
  run: WaLabelSyncRun | undefined
  tags: LeadOption[]
  // The ticked tag ids, or null when the number is automatic.
  ticked: number[] | null
  onTick: (ids: number[] | null) => void
}) {
  const room = budget ? Math.max(budget.maxLabels - budget.pics.length, 0) : null
  const chatsOf = new Map<number, number>()
  for (const tag of [...(budget?.tagsIn ?? []), ...(budget?.tagsOut ?? [])]) {
    chatsOf.set(tag.id, tag.chats)
  }
  // Most used on this number first, then the rest by name.
  const ordered = [...tags].sort((a, b) => (chatsOf.get(b.id) ?? 0) - (chatsOf.get(a.id) ?? 0) || a.label.localeCompare(b.label))
  const picColor = budget ? WA_LABEL_COLORS[budget.picColor] : null

  return (
    <section aria-label={`Labels of ${number.label}`} className="space-y-3 rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{number.label}</h3>
        {budget && (
          <span className="text-xs text-slate-500">
            {budget.chats} chats · {budget.pics.length + budget.tagsIn.length} of {budget.maxLabels} labels
          </span>
        )}
      </div>

      {budget === undefined ? (
        <p className="text-xs text-slate-500">Working out tonight&apos;s labels…</p>
      ) : budget === null ? (
        <p className="text-xs text-amber-700">Tonight&apos;s labels of this number could not be read.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-600">Tonight</p>
          <div className="flex flex-wrap gap-1">
            {budget.pics.map((pic) => (
              <Chip key={`pic-${pic.id}`} name={pic.name} color={picColor} />
            ))}
            {budget.tagsIn.map((tag) => (
              <Chip key={`tag-${tag.id}`} name={tag.name} color={tag.color} />
            ))}
            {budget.pics.length + budget.tagsIn.length === 0 && <span className="text-xs text-slate-500">Nothing yet.</span>}
          </div>
          {budget.tagsOut.length > 0 && (
            <>
              <p className="text-xs font-medium text-slate-600">Left out</p>
              <div className="flex flex-wrap gap-1">
                {budget.tagsOut.map((tag) => (
                  <span key={tag.id} title={tag.why === 'full' ? 'No room left' : 'Not ticked'}>
                    <Chip name={`${tag.name} (${tag.why === 'full' ? 'full' : 'not ticked'})`} muted />
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-slate-600">Which tags go to this number</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name={`mode-${number.inboxId}`} checked={ticked === null} onChange={() => onTick(null)} />
          Automatic: Handled-by first, then the most used tags
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="radio"
            name={`mode-${number.inboxId}`}
            checked={ticked !== null}
            // Start from tonight's automatic choice, so nothing changes until a tag is ticked or unticked.
            onChange={() => onTick(budget ? budget.tagsIn.map((tag) => tag.id) : [])}
          />
          Only the tags I tick
        </label>
      </fieldset>

      {ticked !== null && (
        <div className="space-y-1.5">
          {room !== null && ticked.length > room && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Room for {room} tags after the Handled-by labels: the {ticked.length - room} least used ticked ones are left out.
            </p>
          )}
          <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {ordered.map((tag) => (
              <label key={tag.id} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={ticked.includes(tag.id)}
                  onChange={() => onTick(ticked.includes(tag.id) ? ticked.filter((id) => id !== tag.id) : [...ticked, tag.id])}
                />
                {tag.color ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} /> : null}
                <span className="min-w-0 flex-1 truncate">{tag.label}</span>
                <span className="text-xs text-slate-400">{chatsOf.get(tag.id) ?? 0}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <RunReport run={run} />
    </section>
  )
}

// Admin, from the WhatsApp numbers window: the nightly label sync's settings, each number's labels for tonight, and
// the last night's report.
export function WaLabelSyncDialog({ tags, onClose, api = realApi }: { tags: LeadOption[]; onClose: () => void; api?: WaLabelSyncApi }) {
  const [settings, setSettings] = useState<WaLabelSyncSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [numbers, setNumbers] = useState<InboxChannel[]>([])
  const [budgets, setBudgets] = useState<Map<number, WaLabelBudget | null>>(new Map())
  const [runs, setRuns] = useState<Map<number, WaLabelSyncRun>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const loadBudgets = useCallback(
    async (list: InboxChannel[]) => {
      const entries = await Promise.all(list.map(async (number) => [number.inboxId, await api.fetchBudget(number.inboxId)] as const))
      setBudgets(new Map(entries))
    },
    [api],
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const [read, list, lastRuns] = await Promise.all([
        api.fetchSettings(),
        api.fetchNumbers().catch(() => [] as InboxChannel[]),
        api.fetchRuns(),
      ])
      if (!alive) return
      const whatsapp = list.filter((number) => number.kind === 'whatsapp' && number.isActive)
      setSettings(read.settings)
      setLoadError(read.error)
      setNumbers(whatsapp)
      setRuns(lastRuns)
      if (read.settings) {
        await loadBudgets(whatsapp)
      }
    })()
    return () => {
      alive = false
    }
  }, [api, loadBudgets])

  function change(patch: Partial<WaLabelSyncSettings>) {
    setSettings((current) => (current ? { ...current, ...patch } : current))
    setSaved(false)
  }

  function tick(inboxId: number, ids: number[] | null) {
    if (!settings) return
    const inboxes = { ...settings.inboxes }
    if (ids === null) {
      delete inboxes[inboxId]
    } else {
      inboxes[inboxId] = ids
    }
    change({ inboxes })
  }

  async function save() {
    if (!settings) return
    setIsSaving(true)
    setError(null)
    const result = await api.save(settings)
    setIsSaving(false)
    if (typeof result === 'string') {
      setError(result)
      return
    }
    setSettings(result)
    setSaved(true)
    setBudgets(new Map())
    await loadBudgets(numbers)
  }

  const activeTags = tags.filter((tag) => tag.kind === 'tag' && tag.isActive)

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">WhatsApp labels</h2>
            <p className="mt-1 text-sm text-slate-500">
              Every night at 4 am the CRM puts its tags and Handled-by names on each WhatsApp number&apos;s chats as
              labels, so the phone shows them too. Nothing is sent to parents.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {!settings && !loadError && <p className="text-sm text-slate-500">Loading…</p>}
          {loadError && (
            <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {loadError}
            </p>
          )}
          {settings && (
            <>
              <section aria-label="Label settings" className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" checked={settings.enabled} onChange={(event) => change({ enabled: event.target.checked })} />
                  Put the labels on every night
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <NumberField label="Labels per number" value={settings.maxLabels} min={1} max={60} onChange={(maxLabels) => change({ maxLabels })} />
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Handled-by label starts with</span>
                    <input value={settings.picPrefix} onChange={(event) => change({ picPrefix: event.target.value })} className={fieldClass} />
                  </label>
                  <NumberField label="Chats per night (most)" value={settings.perNight} min={1} max={2000} onChange={(perNight) => change({ perNight })} />
                  <NumberField label="Seconds between chats" value={settings.gapSeconds} min={1} max={30} onChange={(gapSeconds) => change({ gapSeconds })} />
                </div>
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">
                    Handled-by label colour{' '}
                    <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-normal text-slate-700">
                      <span className="size-2 rounded-full" style={{ backgroundColor: WA_LABEL_COLORS[settings.picColor] }} />
                      {settings.picPrefix}Amy
                    </span>
                  </legend>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {WA_LABEL_COLORS.map((color, index) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Colour ${index + 1}`}
                        aria-pressed={settings.picColor === index}
                        onClick={() => change({ picColor: index })}
                        className={`size-7 rounded-full border-2 ${settings.picColor === index ? 'border-slate-900' : 'border-white'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </fieldset>
              </section>

              {numbers.length === 0 ? (
                <p className="text-sm text-slate-500">No WhatsApp number yet.</p>
              ) : (
                numbers.map((number) => (
                  <NumberCard
                    key={number.inboxId}
                    number={number}
                    budget={budgets.has(number.inboxId) ? budgets.get(number.inboxId) : undefined}
                    run={runs.get(number.inboxId)}
                    tags={activeTags}
                    ticked={settings.inboxes[number.inboxId] ?? null}
                    onTick={(ids) => tick(number.inboxId, ids)}
                  />
                ))
              )}
            </>
          )}
        </div>

        {settings && (
          <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              {saved && <span className="text-sm text-emerald-700">Saved. Tonight&apos;s labels are worked out again.</span>}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void save()}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
