import { useMemo, useState } from 'react'
import { CaretLeft } from '@phosphor-icons/react'
import {
  findStudentsByPhone,
  getFirstMessage,
  guessSourceAndTags,
  resolveChatLead,
} from '../../lib/chatLink'
import { searchLeads } from '../../lib/leadSearch'
import {
  getChatIdentity,
  getLinkedLeadId,
  getOwner,
  getRealPhone,
  type ChatwootConversation,
  type ChatwootMessage,
} from '../../lib/whatsappInbox'
import type { WhatsAppCrm } from './crm'
import { FirstMessageCard } from './FirstMessageCard'
import { LeadCard } from './LeadCard'
import { NewLeadForm } from './NewLeadForm'
import { StudentCard } from './StudentCard'

type DetailsPanelProps = {
  conversation: ChatwootConversation
  messages: ChatwootMessage[]
  hasOlder: boolean
  crm: WhatsAppCrm
  className?: string
  onLoadOlder: () => void
  onSavePhone: (contactId: number, digits: string) => Promise<boolean>
  onLinkLead: (leadId: number | null) => Promise<boolean>
  // Only on small screens, where this panel takes the place of the chat.
  onBack?: () => void
}

// The side panel: who the parent is, and what the school already knows about
// them (a lead, a student), or a way to add them.
export function DetailsPanel({
  conversation,
  messages,
  hasOlder,
  crm,
  className,
  onLoadOlder,
  onSavePhone,
  onLinkLead,
  onBack,
}: DetailsPanelProps) {
  const sender = conversation.meta.sender
  const identity = getChatIdentity(sender)
  const owner = getOwner(conversation)
  const phone = getRealPhone(sender.phone_number)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const { lead, byPhone } = resolveChatLead(getLinkedLeadId(conversation), phone, crm.leads)

  const student =
    (lead?.convertedStudentId != null ? crm.students.find((entry) => entry.id === lead.convertedStudentId) : null) ??
    findStudentsByPhone(phone, crm.students)[0] ??
    null

  const first = useMemo(() => getFirstMessage(messages), [messages])
  const guess = useMemo(() => guessSourceAndTags(first?.text ?? '', crm.leadOptions), [first, crm.leadOptions])
  const found = useMemo(() => searchLeads(crm.leads, query), [crm.leads, query])

  async function savePhone() {
    const digits = phoneInput.replace(/\D/g, '')
    if (digits.length < 9 || digits.length > 13) {
      setPhoneError('Enter the full number, for example 012 345 6789.')
      return
    }
    const national = digits.startsWith('0') ? `60${digits.slice(1)}` : digits
    setPhoneError(null)
    if (await onSavePhone(sender.id, national)) {
      setPhoneInput('')
    }
  }

  const initialName = identity.title === 'Hidden number' || identity.title.startsWith('+') ? '' : identity.title

  return (
    <aside className={className}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 xl:hidden"
        >
          <CaretLeft size={16} aria-hidden="true" />
          Back to the chat
        </button>
      )}
      <h3 className="text-sm font-semibold text-slate-900">{identity.title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{identity.subtitle}</p>
      <p className="mt-1 text-xs text-slate-500">Handled by: {owner ? owner.name : 'no one yet'}</p>

      {!identity.hasRealPhone && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">WhatsApp hides this parent's number.</p>
          <p className="mt-1">If you know it, add it here so the chat matches the right lead or student.</p>
          <label className="mt-2 block">
            <span className="sr-only">Parent phone number</span>
            <input
              type="tel"
              value={phoneInput}
              onChange={(event) => {
                setPhoneInput(event.target.value)
                setPhoneError(null)
              }}
              placeholder="012 345 6789"
              className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97]"
            />
          </label>
          {phoneError && <p className="mt-1 text-red-600">{phoneError}</p>}
          <button
            type="button"
            onClick={() => void savePhone()}
            className="mt-2 w-full rounded-lg bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#e00a87]"
          >
            Save number
          </button>
        </div>
      )}

      <div className="mt-5 space-y-5 border-t border-slate-100 pt-4">
        {lead ? (
          <LeadCard
            lead={lead}
            crm={crm}
            byPhone={byPhone}
            onUnlink={() => void onLinkLead(null)}
          />
        ) : (
          <>
            <FirstMessageCard first={first} guess={guess} hasOlder={hasOlder} onLoadOlder={onLoadOlder} />
            {crm.canEditLeads ? (
              <NewLeadForm
                key={conversation.id}
                crm={crm}
                initialName={initialName}
                initialPhone={phone ? `+${phone}` : ''}
                guess={guess}
                onCreated={async (leadId) => {
                  await onLinkLead(leadId)
                }}
              />
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                This parent is not a lead yet. You can look but not add leads.
              </p>
            )}
            <div className="text-xs">
              <label className="block">
                <span className="font-semibold text-slate-700">Already a lead? Find them</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name or phone number"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
                />
              </label>
              {query.trim() && found.length === 0 && <p className="mt-1 text-slate-500">No lead found.</p>}
              {found.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {found.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => void onLinkLead(entry.id)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-left hover:bg-slate-50"
                      >
                        <span className="block truncate text-sm text-slate-900">
                          {entry.fullName || entry.children[0]?.name || 'Unnamed lead'}
                        </span>
                        <span className="block truncate text-slate-500">{entry.phone ?? 'No phone number'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {student && <StudentCard key={student.id} student={student} crm={crm} />}
      </div>
    </aside>
  )
}
