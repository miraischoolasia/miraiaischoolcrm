import { useState } from 'react'
import type { Lead } from '../../types/domain'
import { hasChildPhoneMatches, keptLead, type ChildPhoneMatches as Matches } from '../../lib/childPhone'
import type { ChatwootConversation } from '../../lib/whatsappInbox'

type Props = {
  matches: Matches
  // The lead this form is for (null: a new lead, not saved yet).
  lead: Lead | null
  // Joins another lead into this one (or opens it, for a new lead). Resolves to a problem, or null.
  onLinkLead: (other: Lead) => Promise<string | null>
  // Ties a chat to this lead. Resolves to a problem, or null. Absent for a new lead.
  onLinkChat?: (conversationId: number) => Promise<string | null>
  onOpenChat?: (conversationId: number) => void
}

const titleOf = (lead: Lead) => lead.fullName || lead.children[0]?.name || 'Unnamed lead'

// Under a child's phone number: what the school already has with it, and the way to link it instead of making a
// second lead. Joining two leads is asked first, saying which lead joins which.
export function ChildPhoneMatches({ matches, lead, onLinkLead, onLinkChat, onOpenChat }: Props) {
  const [asking, setAsking] = useState<Lead | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [linkedChats, setLinkedChats] = useState<Set<number>>(new Set())

  if (!hasChildPhoneMatches(matches)) {
    return null
  }

  async function run(work: () => Promise<string | null>) {
    setBusy(true)
    setProblem(null)
    const result = await work()
    setBusy(false)
    setProblem(result)
    return result === null
  }

  const chatTitle = (chat: ChatwootConversation) => chat.meta.sender.name?.trim() || 'WhatsApp chat'
  const kept = asking && lead ? keptLead(lead, asking) : null
  const joined = asking && kept ? (kept.id === lead?.id ? asking : lead) : null

  return (
    <div className="space-y-1 rounded-lg bg-slate-50 px-2.5 py-2 text-xs" aria-label="Already known by this number">
      {matches.sameAsParent && <p className="text-amber-700">This is the parent's number, not the child's.</p>}
      {matches.leads.map((other) => (
        <div key={`lead-${other.id}`} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-slate-700">
            Already: <strong>{titleOf(other)}</strong> (lead)
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => (lead ? setAsking(other) : void run(() => onLinkLead(other)))}
            className="shrink-0 rounded-md border border-[#fc0c97] px-2 py-0.5 font-semibold text-[#be185d] hover:bg-pink-50 disabled:opacity-60"
          >
            Link
          </button>
        </div>
      ))}
      {asking && kept && joined && (
        <div role="alertdialog" aria-label="Join two leads" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-slate-800">
          <p>
            <strong>{titleOf(joined)}</strong>
            {joined.phone ? ` (${joined.phone})` : ''} will be joined into <strong>{titleOf(kept)}</strong>
            {kept.phone ? ` (${kept.phone})` : ''}. {titleOf(kept)} stays; its children, tags and chats are put together and
            nothing is lost.
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => onLinkLead(asking)).then((ok) => {
                  if (ok) setAsking(null)
                })
              }
              className="rounded-md bg-[#fc0c97] px-2.5 py-1 font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
            >
              {busy ? 'Joining...' : 'Join them'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsking(null)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {matches.students.map((student) => (
        <p key={`student-${student.id}`} className="truncate text-slate-700">
          Already a student: <strong>{student.name}</strong>
        </p>
      ))}
      {matches.chats.map((chat) => (
        <div key={`chat-${chat.id}`} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-slate-700">
            Has a WhatsApp chat: <strong>{chatTitle(chat)}</strong>
          </span>
          <span className="flex shrink-0 gap-1">
            {onLinkChat && !linkedChats.has(chat.id) && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() => onLinkChat(chat.id)).then((ok) => {
                    if (ok) setLinkedChats((current) => new Set(current).add(chat.id))
                  })
                }
                className="rounded-md border border-[#fc0c97] px-2 py-0.5 font-semibold text-[#be185d] hover:bg-pink-50 disabled:opacity-60"
              >
                Link
              </button>
            )}
            {linkedChats.has(chat.id) && <span className="px-1 font-medium text-emerald-700">Linked</span>}
            {onOpenChat && (
              <button
                type="button"
                onClick={() => onOpenChat(chat.id)}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Open chat
              </button>
            )}
          </span>
        </div>
      ))}
      {problem && (
        <p role="alert" className="text-red-700">
          {problem}
        </p>
      )}
    </div>
  )
}
