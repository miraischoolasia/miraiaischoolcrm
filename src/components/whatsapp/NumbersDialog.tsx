import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import type { WhatsAppNumber, WhatsAppNumberDraft } from '../../lib/whatsappNumbers'

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
}

const fieldClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'

const emptyDraft: WhatsAppNumberDraft = { label: '', phone: '', inboxId: null, instance: '', isActive: true }

// Admin: the school's WhatsApp numbers, and which staff work on which. An admin sees every number.
export function NumbersDialog({ numbers, assignments, staff, inboxes, onSave, onRemove, onClose }: NumbersDialogProps) {
  // null: not editing; 'new': a new number; otherwise the number being changed.
  const [editing, setEditing] = useState<WhatsAppNumber | 'new' | null>(null)
  const [draft, setDraft] = useState<WhatsAppNumberDraft>(emptyDraft)
  const [teacherIds, setTeacherIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)

  useEffect(() => {
    if (editing === null || editing === 'new') {
      setDraft(emptyDraft)
      setTeacherIds([])
    } else {
      setDraft({
        label: editing.label,
        phone: editing.phone ?? '',
        inboxId: editing.inboxId,
        instance: editing.instance ?? '',
        isActive: editing.isActive,
      })
      setTeacherIds(assignments.get(editing.id) ?? [])
    }
    setError(null)
  }, [editing, assignments])

  async function save() {
    setIsSaving(true)
    const problem = await onSave(editing === 'new' || editing === null ? null : editing, draft, teacherIds)
    setIsSaving(false)
    if (problem) {
      setError(problem)
      return
    }
    setEditing(null)
  }

  const staffName = (id: number) => staff.find((entry) => entry.id === id)?.name ?? 'Someone'

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
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

      <div className="space-y-4 px-6 py-5">
        {editing === null && (
          <>
            {numbers.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                No number is set up yet. Add the number the school uses now first, then the next ones.
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
                            {!number.isActive && <span className="ml-2 text-xs font-medium text-slate-500">(off)</span>}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {number.phone ? `+${number.phone} · ` : ''}Inbox {number.inboxId}
                            {number.instance ? ` · ${number.instance}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
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
                    </li>
                  )
                })}
              </ul>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
            >
              Add a number
            </button>
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
              <span className="text-sm font-medium text-slate-700">Evolution name (optional)</span>
              <input
                value={draft.instance}
                onChange={(event) => setDraft({ ...draft, instance: event.target.value })}
                placeholder="mirai-test"
                className={fieldClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              />
              This number is in use
            </label>

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
