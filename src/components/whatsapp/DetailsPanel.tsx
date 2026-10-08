import { useState } from 'react'
import { getChatIdentity, getOwner, type ChatwootConversation } from '../../lib/whatsappInbox'

type DetailsPanelProps = {
  conversation: ChatwootConversation
  className?: string
  onSavePhone: (contactId: number, digits: string) => Promise<boolean>
}

// The side panel. For now it shows who the parent is and lets the team add a
// number WhatsApp hid. Lead and student details come in the next update.
export function DetailsPanel({ conversation, className, onSavePhone }: DetailsPanelProps) {
  const sender = conversation.meta.sender
  const identity = getChatIdentity(sender)
  const owner = getOwner(conversation)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 13) {
      setError('Enter the full number, for example 012 345 6789.')
      return
    }
    const national = digits.startsWith('0') ? `60${digits.slice(1)}` : digits
    setError(null)
    if (await onSavePhone(sender.id, national)) {
      setPhone('')
    }
  }

  return (
    <aside className={className}>
      <h3 className="text-sm font-semibold text-slate-900">{identity.title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{identity.subtitle}</p>

      {!identity.hasRealPhone && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">WhatsApp hides this parent's number.</p>
          <p className="mt-1">If you know it, add it here so the chat matches the right lead or student.</p>
          <label className="mt-2 block">
            <span className="sr-only">Parent phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
                setError(null)
              }}
              placeholder="012 345 6789"
              className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97]"
            />
          </label>
          {error && <p className="mt-1 text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => void save()}
            className="mt-2 w-full rounded-lg bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#e00a87]"
          >
            Save number
          </button>
        </div>
      )}

      <dl className="mt-4 space-y-3 text-xs">
        <div>
          <dt className="text-slate-500">Handled by</dt>
          <dd className="mt-0.5 text-sm text-slate-900">{owner ? owner.name : 'No one yet. The first reply takes the chat.'}</dd>
        </div>
      </dl>

      <p className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Lead and student details, and the first-message card, will show here in the next update.
      </p>
    </aside>
  )
}
