import { useMemo, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { searchLeads } from '../../lib/leadSearch'
import { normalizePhoneInput } from '../../lib/startChat'
import type { Lead } from '../../types/domain'

type NewChatDialogProps = {
  leads: Lead[]
  // Filled in when the dialog is opened from a number that has no chat yet.
  initial?: { phone: string; name: string; leadId: number | null }
  onClose: () => void
  // Opens the chat; resolves to an error message, or null when it opened.
  onStart: (input: { phone: string; name: string; leadId: number | null }) => Promise<string | null>
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'

// Start a chat with a parent who has not written first, by number or from a lead.
export function NewChatDialog({ leads, initial, onClose, onStart }: NewChatDialogProps) {
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [leadId, setLeadId] = useState<number | null>(initial?.leadId ?? null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  // Only leads that have a number can be messaged.
  const found = useMemo(() => searchLeads(leads, query, 20).filter((lead) => lead.phone).slice(0, 5), [leads, query])

  async function start() {
    if (!normalizePhoneInput(phone)) {
      setError('Enter the full number, for example 012 345 6789.')
      return
    }
    setIsStarting(true)
    setError(null)
    const problem = await onStart({ phone, name, leadId })
    setIsStarting(false)
    if (problem) {
      setError(problem)
      return
    }
    onClose()
  }

  return (
    <ModalShell maxWidth="sm" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">New chat</h2>
          <p className="mt-1 text-sm text-slate-500">Message a parent who has not written to you yet.</p>
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
        <div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Find a lead</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or phone number"
              className={fieldClass}
            />
          </label>
          {query.trim() && found.length === 0 && <p className="mt-1 text-xs text-slate-500">No lead with a phone number found.</p>}
          {found.length > 0 && (
            <ul className="mt-1 space-y-1">
              {found.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPhone(lead.phone ?? '')
                      setName(lead.fullName || lead.children[0]?.name || '')
                      setLeadId(lead.id)
                      setQuery('')
                      setError(null)
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="block truncate text-slate-900">{lead.fullName || lead.children[0]?.name || 'Unnamed lead'}</span>
                    <span className="block truncate text-xs text-slate-500">{lead.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Phone number</span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value)
              setLeadId(null)
              setError(null)
            }}
            placeholder="012 345 6789"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name (optional)</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
        </label>
        {leadId !== null && <p className="text-xs text-slate-500">This chat will be tied to the lead you picked.</p>}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isStarting}
          onClick={() => void start()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
        >
          {isStarting ? 'Opening...' : 'Start chat'}
        </button>
      </div>
    </ModalShell>
  )
}
