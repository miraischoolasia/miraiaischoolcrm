import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { LinkWhatsAppPanel } from './LinkWhatsAppPanel'
import {
  inboxZoneLabels,
  setNumberZone,
  type InboxZone,
  type WhatsAppNumber,
  type WhatsAppNumberDraft,
} from '../../lib/whatsappNumbers'
import { createWaNumbersApi, type ServerNumber, type WaNumbersApi } from '../../lib/waNumbersApi'
import { channelLabelProblem, shortLabelOf, type ChannelLabel, type ChannelLabels } from '../../lib/channelLabels'
import { ChannelLabelFields } from './ChannelLabelFields'

export type AssignableStaff = { id: number; name: string }

type NumbersDialogProps = {
  numbers: WhatsAppNumber[]
  // number id -> staff ids it is given to
  assignments: Map<number, number[]>
  staff: AssignableStaff[]
  // The inboxes Chatwoot has, to pick from; empty when they could not be read.
  inboxes: { id: number; name: string }[]
  onSave: (existing: WhatsAppNumber | null, draft: WhatsAppNumberDraft, teacherIds: number[]) => Promise<string | null>
  onRemove: (number: WhatsAppNumber) => Promise<string | null>
  onClose: () => void
  // The gateway address; with it the admin can link the school phone by a QR code from here.
  apiUrl?: string
  // Reads the numbers table again (the server writes a number it adds into it).
  onReload?: () => Promise<void>
  // The server's numbers (tests and the demo pass their own).
  numbersApi?: WaNumbersApi
  // Each number's short name and colour (channel_labels, keyed by the inbox id), and how one is saved.
  labels?: ChannelLabels
  onSaveLabel?: (key: string, label: ChannelLabel) => Promise<string | null>
  // Puts a number the server just added into the Student Inbox (tests pass their own).
  setZone?: (inboxId: number, zone: InboxZone) => Promise<void>
}

// A step that changes the phones waits for "Yes" first.
type Asking =
  | { kind: 'add'; label: string; zone: InboxZone }
  | { kind: 'off'; instance: string; label: string; first: boolean }
  | { kind: 'on'; instance: string; label: string }

const ASKING_TEXT: Record<Asking['kind'], { title: (label: string) => string; yes: string }> = {
  add: { title: (label) => `Add a new WhatsApp number called "${label}"?`, yes: 'Yes, add it' },
  off: { title: (label) => `Turn off ${label}?`, yes: 'Yes, turn it off' },
  on: { title: (label) => `Turn ${label} on again?`, yes: 'Yes, turn it on' },
}

function askingDetail(asking: Asking) {
  if (asking.kind === 'add') {
    return `Its chats go to the ${inboxZoneLabels[asking.zone]}. The WhatsApp server makes it now (it takes a moment), then its QR code shows here. Have the new phone ready to scan it.`
  }
  if (asking.kind === 'on') {
    return 'Then scan its QR code again with its phone.'
  }
  return asking.first
    ? "This is the school's first number. Its phone is logged out, and the school's main WhatsApp stops sending and receiving here. The chats stay and can still be read."
    : 'Its phone is logged out of the CRM. The chats stay and can still be read, but not answered.'
}

const fieldClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'

const emptyDraft: WhatsAppNumberDraft = { label: '', phone: '', inboxId: null, instance: '', isActive: true, zone: 'marketing' }

// Which inbox a number's chats go to: the Marketing Inbox, or the Student Inbox under Students.
function ZoneField({ value, onChange }: { value: InboxZone; onChange: (zone: InboxZone) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">Its chats go to</span>
      <select value={value} onChange={(event) => onChange(event.target.value as InboxZone)} className={fieldClass}>
        <option value="marketing">{inboxZoneLabels.marketing} (new parents, enrolment)</option>
        <option value="students">{inboxZoneLabels.students} (students and their parents)</option>
      </select>
    </label>
  )
}

// Admin: the school's WhatsApp numbers, and which staff work on which. An admin sees every number.
export function NumbersDialog({
  numbers,
  assignments,
  staff,
  inboxes,
  onSave,
  onRemove,
  onClose,
  apiUrl,
  onReload,
  numbersApi,
  labels,
  onSaveLabel,
  setZone = setNumberZone,
}: NumbersDialogProps) {
  // null: not editing; 'new': a new number; otherwise the number being changed.
  const [editing, setEditing] = useState<WhatsAppNumber | 'new' | null>(null)
  const [draft, setDraft] = useState<WhatsAppNumberDraft>(emptyDraft)
  const [teacherIds, setTeacherIds] = useState<number[]>([])
  // The short name and colour the Inbox shows for the number being changed.
  const [look, setLook] = useState<ChannelLabel>({ shortName: null, color: null })
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
  // The school adds numbers itself when its WhatsApp server can (EduHero); null: it cannot, or not known yet.
  const server = useMemo(() => numbersApi ?? (apiUrl ? createWaNumbersApi(apiUrl) : null), [numbersApi, apiUrl])
  const [serverNumbers, setServerNumbers] = useState<ServerNumber[] | null>(null)
  const [newLabel, setNewLabel] = useState<string | null>(null)
  const [newZone, setNewZone] = useState<InboxZone>('marketing')
  const [asking, setAsking] = useState<Asking | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  // The number just added or turned on: its QR code opens at once.
  const [justAdded, setJustAdded] = useState<string | null>(null)
  // The "Are you sure?" box is below the list: it is brought into view when it opens.
  const askingBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (asking) {
      askingBox.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    }
  }, [asking])

  useEffect(() => {
    let cancelled = false
    server?.list().then((list) => {
      if (!cancelled) {
        setServerNumbers(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [server])
  const selfService = serverNumbers !== null
  const serverOf = (instance: string | null) => serverNumbers?.find((entry) => entry.instance === instance) ?? null
  // On the server but not in the list (numbers made before the list knew them): one press adds them.
  const missing = (serverNumbers ?? []).filter((entry) => !numbers.some((number) => number.instance === entry.instance))

  async function confirm() {
    if (!asking || !server) {
      return
    }
    setIsWorking(true)
    setError(null)
    try {
      if (asking.kind === 'add') {
        const made = await server.add(asking.label)
        setNewLabel(null)
        setNewZone('marketing')
        setJustAdded(made.instance)
        if (asking.zone === 'students') {
          try {
            await setZone(made.inboxId, 'students')
          } catch {
            setError(`${asking.label} was added, but not moved to the Student Inbox. Press Edit on it and pick the Student Inbox.`)
          }
        }
      } else if (asking.kind === 'off') {
        await server.turnOff(asking.instance)
      } else {
        await server.turnOn(asking.instance)
        setJustAdded(asking.instance)
      }
      setAsking(null)
      await onReload?.()
      setServerNumbers(await server.list())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't do it. Try again.")
      setAsking(null)
    } finally {
      setIsWorking(false)
    }
  }

  async function addToList(entry: ServerNumber) {
    setError(null)
    const problem = await onSave(
      null,
      { label: entry.label, phone: '', inboxId: entry.inboxId, instance: entry.instance, isActive: entry.active, zone: 'marketing' },
      [],
    )
    if (problem) {
      setError(problem)
    }
  }

  useEffect(() => {
    if (editing === null || editing === 'new') {
      setDraft(emptyDraft)
      setTeacherIds([])
      setLook({ shortName: null, color: null })
    } else {
      setLook(labels?.get(String(editing.inboxId)) ?? { shortName: null, color: null })
      setDraft({
        label: editing.label,
        phone: editing.phone ?? '',
        inboxId: editing.inboxId,
        instance: editing.instance ?? '',
        isActive: editing.isActive,
        zone: editing.zone,
      })
      setTeacherIds(assignments.get(editing.id) ?? [])
    }
    setError(null)
    // The labels are read once when a number is opened; a later read must not undo what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, assignments])

  async function save() {
    const lookProblem = channelLabelProblem(look)
    if (lookProblem) {
      setError(lookProblem)
      return
    }
    setIsSaving(true)
    const problem = await onSave(editing === 'new' || editing === null ? null : editing, draft, teacherIds)
    // The short name and colour go with the number's inbox.
    const saved = labels?.get(String(draft.inboxId)) ?? { shortName: null, color: null }
    const changed = (saved.shortName ?? '') !== (look.shortName?.trim() ?? '') || (saved.color ?? null) !== (look.color ?? null)
    const lookFailed = !problem && onSaveLabel && draft.inboxId !== null && changed ? await onSaveLabel(String(draft.inboxId), look) : null
    setIsSaving(false)
    if (problem || lookFailed) {
      setError(problem ?? lookFailed)
      return
    }
    setEditing(null)
  }

  const staffName = (id: number) => staff.find((entry) => entry.id === id)?.name ?? 'Someone'
  // A school with many numbers links each one by its own QR code, found by its Evolution name. Until a name is
  // written down, the school's one phone is linked from the top, as before.
  const named = numbers.some((number) => number.instance)
  const unnamed = numbers.filter((number) => !number.instance)

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      {/* Never taller than the screen: the title and the buttons stay in view, the middle scrolls (a long staff list). */}
      <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">WhatsApp numbers</h2>
            <p className="mt-1 text-sm text-slate-500">
              Give each number to the staff who answer it. Admins always see every number. Until a number is added
              here, everyone sees the one inbox.
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {editing === null && (
            <>
              {apiUrl && !named && <LinkWhatsAppPanel apiUrl={apiUrl} />}
              {numbers.length > 1 && unnamed.length > 0 && (
                <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  With more than one number, every number needs its Evolution name, the first one too. Without it,
                  reactions, edits, read ticks and the QR code of that number go to the school's first phone. Missing on:{' '}
                  {unnamed.map((number) => `${number.label} (inbox ${number.inboxId})`).join(', ')}. Press Edit to fill
                  it in; the server team gives the names.
                </p>
              )}
              {numbers.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  No number is set up yet. Add the number the school uses now first, then the next ones. Give each
                  number the staff who answer it: once a number is added, staff see only the numbers given to them.
                </p>
              ) : (
                <ul className="space-y-2">
                  {numbers.map((number) => {
                    const given = assignments.get(number.id) ?? []
                    return (
                      <li key={number.id} className="rounded-xl border border-slate-200 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {number.label}
                              {(!number.isActive || serverOf(number.instance)?.active === false) && (
                                <span className="ml-2 text-xs font-medium text-slate-500">(off: chats can be read, not answered)</span>
                              )}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {number.phone ? `+${number.phone} · ` : ''}Inbox {number.inboxId}
                              {number.instance ? ` · ${number.instance}` : ''}
                              {number.zone === 'students' ? ` · ${inboxZoneLabels.students}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {selfService && number.instance && serverOf(number.instance) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAsking(
                                    serverOf(number.instance)?.active === false
                                      ? { kind: 'on', instance: number.instance!, label: number.label }
                                      : { kind: 'off', instance: number.instance!, label: number.label, first: number.id === numbers[0]?.id },
                                  )
                                }
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                {serverOf(number.instance)?.active === false ? 'Turn on' : 'Turn off'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditing(number)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            {removing === number.id ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const problem = await onRemove(number)
                                  setRemoving(null)
                                  if (problem) {
                                    setError(problem)
                                  }
                                }}
                                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                              >
                                Really remove?
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRemoving(number.id)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          {given.length === 0 ? 'Only admins see this number.' : `Given to: ${given.map(staffName).join(', ')}`}
                        </p>
                        {apiUrl && number.instance && number.isActive && serverOf(number.instance)?.active !== false && (
                          <div className="mt-3">
                            <LinkWhatsAppPanel
                              key={`${number.instance}:${justAdded === number.instance ? 'new' : 'shown'}`}
                              apiUrl={apiUrl}
                              instance={number.instance}
                              title={`Phone of ${number.label}`}
                              autoStart={justAdded === number.instance}
                            />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {missing.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">On the WhatsApp server, not in this list yet</p>
                  <p className="mt-1 text-xs">Add them, so their reactions, read ticks and QR code go to the right phone.</p>
                  <ul className="mt-2 space-y-1.5">
                    {missing.map((entry) => (
                      <li key={entry.instance} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {entry.label} · inbox {entry.inboxId} · {entry.instance}
                        </span>
                        <button
                          type="button"
                          onClick={() => void addToList(entry)}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          Add to the list
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {asking && (
                <div ref={askingBox} role="alertdialog" aria-label="Are you sure?" className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                  <p className="font-semibold">{ASKING_TEXT[asking.kind].title(asking.label)}</p>
                  <p className="mt-1 text-xs text-slate-600">{askingDetail(asking)}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => void confirm()}
                      className={
                        asking.kind === 'off'
                          ? 'rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60'
                          : 'rounded-lg bg-[#fc0c97] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60'
                      }
                    >
                      {isWorking ? 'Working...' : ASKING_TEXT[asking.kind].yes}
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => setAsking(null)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              {selfService && newLabel !== null ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const label = newLabel.trim()
                    if (label === '' || label.length > 60) {
                      setError('Give the new number a name of 1 to 60 letters, for example "Sales" or "Branch 2".')
                      return
                    }
                    setError(null)
                    setAsking({ kind: 'add', label, zone: newZone })
                  }}
                >
                  <label className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-700">Name of the new number</span>
                    <input
                      value={newLabel}
                      onChange={(event) => setNewLabel(event.target.value)}
                      placeholder="Sales, Branch 2..."
                      className={fieldClass}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <ZoneField value={newZone} onChange={setNewZone} />
                  </div>
                  <button type="submit" className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]">
                    Next
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLabel(null)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                // A school whose server adds numbers: only a name is asked. Otherwise the number is written in by hand.
                <button
                  type="button"
                  onClick={() => (selfService ? setNewLabel('') : setEditing('new'))}
                  className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
                >
                  Add a number
                </button>
              )}
            </>
          )}

          {editing !== null && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input
                  value={draft.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  placeholder="Main, Sales, Support..."
                  className={fieldClass}
                />
              </label>
              <ZoneField value={draft.zone} onChange={(zone) => setDraft({ ...draft, zone })} />
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Phone number (optional, for showing)</span>
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                  placeholder="60123456789"
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Chatwoot inbox</span>
                {inboxes.length > 0 ? (
                  <select
                    value={draft.inboxId ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, inboxId: event.target.value ? Number(event.target.value) : null })
                    }
                    className={fieldClass}
                  >
                    <option value="">Pick the inbox of this number</option>
                    {inboxes.map((inbox) => (
                      <option key={inbox.id} value={inbox.id}>
                        {inbox.name} (inbox {inbox.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={draft.inboxId ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, inboxId: event.target.value ? Number(event.target.value) : null })
                    }
                    placeholder="The inbox number in Chatwoot"
                    className={fieldClass}
                  />
                )}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Evolution name</span>
                <input
                  value={draft.instance}
                  onChange={(event) => setDraft({ ...draft, instance: event.target.value })}
                  placeholder="The number's name on the WhatsApp server"
                  className={fieldClass}
                />
                <span className="mt-1 block text-xs text-slate-500">
                  The server team gives it. Needed for every number once the school has more than one (the first one
                  too): it sends reactions, edits, read ticks and the QR code to this number's phone.
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
                />
                This number is in use
              </label>

              {onSaveLabel && (
                <ChannelLabelFields
                  value={look}
                  onChange={setLook}
                  placeholder={shortLabelOf(undefined, draft.phone, draft.label || 'Number')}
                />
              )}

              <fieldset>
                <legend className="text-sm font-medium text-slate-700">Staff who answer this number</legend>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {staff.length === 0 && <p className="text-xs text-slate-500">There are no staff accounts to give it to.</p>}
                  {staff.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={teacherIds.includes(member.id)}
                        onChange={(event) =>
                          setTeacherIds(
                            event.target.checked
                              ? [...teacherIds, member.id]
                              : teacherIds.filter((id) => id !== member.id),
                          )
                        }
                      />
                      {member.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>

        {/* The buttons of a number being added or changed stay at the bottom, in view. */}
        {editing !== null && (
          <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void save()}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save number'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
