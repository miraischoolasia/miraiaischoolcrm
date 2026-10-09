import { useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'

export type ForwardTarget = { id: number; title: string; subtitle: string }

const MAX_TARGETS = 10

// Pick the chats to send a copy of a message to.
export function ForwardDialog({
  targets,
  preview,
  onClose,
  onForward,
}: {
  targets: ForwardTarget[]
  // One short line of what is being forwarded.
  preview: string
  onClose: () => void
  // Null when it went out, otherwise what to tell the person.
  onForward: (ids: number[]) => Promise<string | null>
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const text = query.trim().toLowerCase()
  const shown = targets.filter((target) => !text || `${target.title} ${target.subtitle}`.toLowerCase().includes(text)).slice(0, 60)

  function toggle(id: number) {
    setChosen((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : current.length < MAX_TARGETS ? [...current, id] : current))
  }

  async function send() {
    setIsSending(true)
    setError(null)
    const problem = await onForward(chosen)
    setIsSending(false)
    if (problem) {
      setError(problem)
      return
    }
    onClose()
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-900">Forward message</h2>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{preview}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <X size={16} />
        </button>
      </div>
      <div data-modal-body className="max-h-[60vh] space-y-3 overflow-y-auto px-6 py-5">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
          <MagnifyingGlass size={16} className="text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or number"
            aria-label="Search chats"
            className="w-full text-sm outline-none"
          />
        </label>
        <ul className="divide-y divide-slate-100">
          {shown.map((target) => (
            <li key={target.id}>
              <label className="flex cursor-pointer items-center gap-3 px-1 py-2 hover:bg-slate-50">
                <input type="checkbox" checked={chosen.includes(target.id)} onChange={() => toggle(target.id)} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{target.title}</span>
                  <span className="block truncate text-xs text-slate-500">{target.subtitle}</span>
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="py-3 text-sm text-slate-500">No chat matches that.</li>}
        </ul>
        {chosen.length >= MAX_TARGETS && <p className="text-xs text-slate-500">You can forward to {MAX_TARGETS} chats at a time.</p>}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={isSending || chosen.length === 0}
          onClick={() => void send()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
        >
          {isSending ? 'Sending...' : chosen.length > 1 ? `Forward to ${chosen.length} chats` : 'Forward'}
        </button>
      </div>
    </ModalShell>
  )
}
