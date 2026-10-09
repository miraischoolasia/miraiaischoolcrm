import { useMemo, useState } from 'react'
import { CaretLeft } from '@phosphor-icons/react'
import {
  getFirstMessage,
  guessSourceAndTags,
  resolveChatLead,
  suggestLeadsByName,
} from '../../lib/chatLink'
import { searchLeads } from '../../lib/leadSearch'
import { makeStudentResolver } from '../../lib/studentLink'
import type { SourceRule } from '../../lib/sourceRules'
import {
  formatListTime,
  getChatIdentity,
  getLinkedLeadId,
  getOwner,
  getRealPhone,
  type ChatwootConversation,
  type ChatwootMessage,
} from '../../lib/whatsappInbox'
import type { WhatsAppCrm } from './crm'
import { FirstMessageCard } from './FirstMessageCard'
import { LeadForm } from './LeadForm'
import { LeadExtras, LeadHeader } from './LeadCard'
import { StudentCard } from './StudentCard'

type DetailsPanelProps = {
  conversation: ChatwootConversation
  messages: ChatwootMessage[]
  hasOlder: boolean
  crm: WhatsAppCrm
  className?: string
  sourceRules: SourceRule[]
  onManageRules?: (phrase: string) => void
  onLoadOlder: () => void
  onLinkLead: (leadId: number | null) => Promise<boolean>
  // Other chats of the same parent (an old one under a hidden ID, say), to jump to.
  otherChats?: { id: number; title: string; lastActivity: number; isDone: boolean }[]
  onOpenChat?: (id: number) => void
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
  sourceRules,
  onManageRules,
  onLoadOlder,
  onLinkLead,
  otherChats = [],
  onOpenChat,
  onBack,
}: DetailsPanelProps) {
  const sender = conversation.meta.sender
  const owner = getOwner(conversation)
  const phone = getRealPhone(sender.phone_number)
  const [query, setQuery] = useState('')

  const { lead, byPhone } = resolveChatLead(getLinkedLeadId(conversation), phone, crm.leads)
  // The parent name on the lead names the chat here too, like in the list.
  const identity = getChatIdentity(sender, lead?.fullName)

  // Every child of this parent: through the lead, the HOA bookings and the phone number.
  const students = useMemo(
    () =>
      makeStudentResolver({ students: crm.students, trialBookings: crm.trialBookings, packages: crm.packages })(lead, phone),
    [crm.students, crm.trialBookings, crm.packages, lead, phone],
  )

  const first = useMemo(() => getFirstMessage(messages), [messages])
  const guess = useMemo(() => guessSourceAndTags(first?.text ?? '', crm.leadOptions, sourceRules), [first, crm.leadOptions, sourceRules])
  const found = useMemo(() => searchLeads(crm.leads, query), [crm.leads, query])

  // The WhatsApp name is only used to find leads with a similar name; it is never shown or copied
  // into the form, where the parent name is what the team writes.
  const whatsappName = identity.name ?? ''
  // No number matched, so offer the leads with a similar name for someone to confirm.
  const nameSuggestions = useMemo(
    () => (lead ? [] : suggestLeadsByName(whatsappName, crm.leads)),
    [lead, whatsappName, crm.leads],
  )

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

      <div className="mt-5 space-y-5 border-t border-slate-100 pt-4">
        {/* The slots below keep their place whether or not the chat is a lead yet, so the
            form is the same one before and after saving and only says "Saved". */}
        {lead ? <LeadHeader lead={lead} byPhone={byPhone} onUnlink={() => void onLinkLead(null)} /> : null}
        {otherChats.length > 0 && onOpenChat && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <h4 className="font-semibold">This parent has another chat</h4>
            <p className="mt-1">WhatsApp can keep an old chat and a new one for the same person.</p>
            <ul className="mt-2 space-y-1.5">
              {otherChats.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    onClick={() => onOpenChat(other.id)}
                    className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-left hover:bg-amber-100"
                  >
                    <span className="block truncate text-sm font-medium text-slate-900">{other.title}</span>
                    <span className="block text-slate-600">
                      Last message {formatListTime(other.lastActivity)}
                      {other.isDone ? ' · Done' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!lead ? (
          <FirstMessageCard
            first={first}
            guess={guess}
            hasOlder={hasOlder}
            onLoadOlder={onLoadOlder}
            onManageRules={crm.canEditLeads ? onManageRules : undefined}
          />
        ) : null}
    {!lead && nameSuggestions.length > 0 && (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <h4 className="font-semibold">Could this parent be one of your leads?</h4>
        <p className="mt-1">
          {identity.hasRealPhone
            ? "Their WhatsApp number is not in any lead, but the name is similar."
            : "WhatsApp hides this number, but the name is similar."}
        </p>
        <ul className="mt-2 space-y-1.5">
          {nameSuggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                onClick={() => void onLinkLead(suggestion.id)}
                className="w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-left hover:bg-amber-100"
              >
                <span className="block truncate text-sm font-medium text-slate-900">
                  {suggestion.fullName || suggestion.children[0]?.name || 'Unnamed lead'}
                </span>
                <span className="block truncate text-slate-600">
                  {suggestion.phone ?? 'No phone number'} · This is them
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )}
        {!lead ? (
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
        ) : null}
        {lead || crm.canEditLeads ? (
          <LeadForm
            key={conversation.id}
            crm={crm}
            lead={lead}
            initialName=""
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
        {lead ? <LeadExtras lead={lead} crm={crm} /> : null}

        {students.map((student) => (
          <StudentCard key={student.id} student={student} crm={crm} />
        ))}
      </div>
    </aside>
  )
}
