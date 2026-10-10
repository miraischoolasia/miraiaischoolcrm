import { useMemo, useState } from 'react'
import { CaretLeft } from '@phosphor-icons/react'
import { getFirstMessage, guessSourceAndTags, parentNumberUpdate, resolveChatLead } from '../../lib/chatLink'
import { searchLeads } from '../../lib/leadSearch'
import { getStudentKind, makeStudentResolver } from '../../lib/studentLink'
import type { SourceRule } from '../../lib/sourceRules'
import {
  formatListTime,
  getLinkedLeadId,
  getLinkedStudentIds,
  getRealPhone,
  type ChatRole,
  type ChatwootConversation,
  type ChatwootMessage,
} from '../../lib/whatsappInbox'
import type { WhatsAppCrm } from './crm'
import { FirstMessageCard } from './FirstMessageCard'
import { LeadForm } from './LeadForm'
import { LeadHeader } from './LeadCard'
import { EnrolPanel } from './EnrolPanel'
import { StudentCard } from './StudentCard'
import { StudentLinker } from './StudentLinker'
import { ChatRolePicker } from './ChatRolePicker'
import type { Student } from '../../types/domain'
import { PanelSection } from './PanelSection'
import type { WaLabel } from '../../lib/waActions'

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
  // Replaces the students tied to this chat by hand.
  onLinkStudents: (studentIds: number[]) => Promise<boolean>
  // Who the team said is on this chat, and a way to say it.
  role?: ChatRole | null
  onSetRole?: (role: ChatRole | null) => Promise<boolean>
  // Who is using the page, written on the receipts and Zoom meetings they add.
  userName?: string | null
  // Puts text in the message box, for the team to read and send.
  onWriteMessage?: (text: string) => void
  // Other chats of the same parent (an old one under a hidden ID, say), to jump to.
  otherChats?: { id: number; title: string; lastActivity: number; isDone: boolean; role?: ChatRole | null }[]
  onOpenChat?: (id: number) => void
  // Labels put on this chat on the phone; shown for reading, they are not changed from here.
  whatsappLabels?: WaLabel[]
  // Messages the team starred in this chat, and a way to take the star off.
  starredMessages?: { id: number; text: string; at: number }[]
  onUnstar?: (id: number) => void
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
  onLinkStudents,
  role = null,
  onSetRole,
  userName = null,
  onWriteMessage,
  otherChats = [],
  onOpenChat,
  whatsappLabels = [],
  starredMessages = [],
  onUnstar,
  onBack,
}: DetailsPanelProps) {
  const sender = conversation.meta.sender
  const phone = getRealPhone(sender.phone_number)
  const [query, setQuery] = useState('')

  const { lead, byPhone } = resolveChatLead(getLinkedLeadId(conversation), phone, crm.leads)

  // Every child of this parent: through the lead, the HOA bookings and the phone number.
  const linkedStudentIds = useMemo(() => getLinkedStudentIds(conversation), [conversation])
  const students = useMemo(
    () =>
      makeStudentResolver({ students: crm.students, trialBookings: crm.trialBookings, packages: crm.packages })(
        lead,
        phone,
        linkedStudentIds,
      ),
    [crm.students, crm.trialBookings, crm.packages, lead, phone, linkedStudentIds],
  )
  // The child (or children) this chat is about: the students found for it, else the children
  // written on the lead, so a lead that is not a student yet can say who is on the chat too.
  const childNames =
    students.length > 0
      ? students.map((student) => student.name)
      : (lead?.children ?? []).map((child) => child.name?.trim()).filter((name): name is string => Boolean(name))

  // A parent whose child is already in a class is not at the start of the HOA steps.
  const isEnrolled = lead?.status === 'converted' || students.some((student) => getStudentKind(student, crm.packages) !== 'hoa')

  async function linkStudent(student: Student) {
    if (!(await onLinkStudents([...linkedStudentIds.filter((id) => id !== student.id), student.id]))) {
      return "Couldn't link this chat to the student. Try again."
    }
    // A student with no number gets this parent's, so the phone finds them from now on.
    if (phone && !student.phone?.trim() && crm.canEditStudents && student.studentType !== 'preview') {
      const problem = await crm.onSetStudentPhone(student.id, phone)
      if (problem) {
        return `Linked, but the number was not saved on the student: ${problem}`
      }
    }
    return null
  }

  // Tying the chat to a lead also gives the lead this chat's number, so it is found by phone
  // from now on; the number it had stays with the child (or in the notes).
  const [numberSaved, setNumberSaved] = useState<string | null>(null)
  async function linkLead(leadId: number) {
    setNumberSaved(null)
    if (!(await onLinkLead(leadId))) {
      return
    }
    const chosen = crm.leads.find((entry) => entry.id === leadId)
    const update = chosen && crm.canEditLeads ? parentNumberUpdate(chosen, phone) : null
    if (!chosen || !update) {
      return
    }
    const problem = await crm.onUpdateLead(chosen.id, {
      fullName: chosen.fullName ?? '',
      phone: update.phone,
      state: chosen.state ?? '',
      sourceId: chosen.sourceId,
      picId: chosen.picId,
      tagIds: chosen.tagIds,
      status: chosen.status,
      children: update.children.map((child) => ({ name: child.name, age: child.age, phone: child.phone })),
      notes: update.notes ?? '',
    })
    setNumberSaved(problem ? `Linked, but the number was not saved on the lead: ${problem}` : "This parent's number is now saved on the lead.")
  }

  // A parent who already has a student is not a new lead: the add-lead form stays out of the way.
  const [leadFormFor, setLeadFormFor] = useState<number | null>(null)
  const showLeadPart = lead !== null || students.length === 0 || leadFormFor === conversation.id

  const first = useMemo(() => getFirstMessage(messages), [messages])
  const guess = useMemo(() => guessSourceAndTags(first?.text ?? '', crm.leadOptions, sourceRules), [first, crm.leadOptions, sourceRules])
  const found = useMemo(() => searchLeads(crm.leads, query), [crm.leads, query])

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
      {/* The name, the number and who handles the chat are in the chat's own header already. */}
      <div className="space-y-5">
        {/* The slots below keep their place whether or not the chat is a lead yet, so the
            form is the same one before and after saving and only says "Saved". */}
        {lead ? <LeadHeader lead={lead} byPhone={byPhone} onUnlink={() => void onLinkLead(null)} /> : null}
        {/* Who the school already has as students comes first: a parent of a student is not a new lead. */}
        {childNames.length > 0 && onSetRole ? (
          <ChatRolePicker
            role={role}
            studentName={childNames.join(' & ')}
            canBeStudent={childNames.length === 1}
            onPick={(next) => void onSetRole(next)}
          />
        ) : null}
        {students.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            crm={crm}
            onUnlink={
              linkedStudentIds.includes(student.id)
                ? () => void onLinkStudents(linkedStudentIds.filter((id) => id !== student.id))
                : undefined
            }
          />
        ))}
        <StudentLinker
          students={crm.students}
          packages={crm.packages}
          shownIds={students.map((student) => student.id)}
          isEmpty={students.length === 0}
          onLink={linkStudent}
        />
        {otherChats.length > 0 && onOpenChat && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <h4 className="font-semibold">This family has another chat</h4>
            <p className="mt-1">The parent, the student and an old chat can each have their own.</p>
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
                      {other.role === 'parent' ? 'Parent · ' : other.role === 'student' ? 'Student · ' : ''}
                      Last message {formatListTime(other.lastActivity)}
                      {other.isDone ? ' · Done' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {numberSaved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{numberSaved}</p>}
        {!showLeadPart ? (
          <button
            type="button"
            onClick={() => setLeadFormFor(conversation.id)}
            className="text-xs font-medium text-[#be185d] hover:underline"
          >
            Also a lead? Add or find the lead
          </button>
        ) : null}
        {showLeadPart && !lead ? (
          <FirstMessageCard
            first={first}
            guess={guess}
            hasOlder={hasOlder}
            onLoadOlder={onLoadOlder}
            onManageRules={crm.canEditLeads ? onManageRules : undefined}
          />
        ) : null}
        {showLeadPart && !lead ? (
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
                    onClick={() => void linkLead(entry.id)}
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
        {!showLeadPart ? null : lead || crm.canEditLeads ? (
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
        {starredMessages.length > 0 && (
          <PanelSection title="Starred messages" aside={<span className="text-slate-500">{starredMessages.length}</span>}>
            <ul className="space-y-1.5">
              {starredMessages.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-3 whitespace-pre-wrap text-slate-800">{entry.text}</span>
                    <span className="block text-[11px] text-slate-500">{formatListTime(entry.at)}</span>
                  </span>
                  {onUnstar && (
                    <button
                      type="button"
                      onClick={() => onUnstar(entry.id)}
                      aria-label="Remove the star"
                      className="rounded p-1 text-slate-500 hover:bg-amber-100"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </PanelSection>
        )}
        {whatsappLabels.length > 0 && (
          <PanelSection title="WhatsApp labels" aside={<span className="text-slate-500">set on the phone</span>}>
            <ul className="flex flex-wrap gap-1.5">
              {whatsappLabels.map((label) => (
                <li key={label.id}>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-slate-700"
                    title="This label was put on the chat on the phone"
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
                    {label.name}
                  </span>
                </li>
              ))}
            </ul>
          </PanelSection>
        )}
        {lead && onWriteMessage ? (
          isEnrolled ? (
            <details className="border-t border-pink-100 pt-4 text-xs">
              <summary className="cursor-pointer font-semibold text-[#be185d]">Enrol another child in HOA</summary>
              <div className="mt-3">
                <EnrolPanel lead={lead} crm={crm} userName={userName} onWriteMessage={onWriteMessage} />
              </div>
            </details>
          ) : (
            <EnrolPanel lead={lead} crm={crm} userName={userName} onWriteMessage={onWriteMessage} />
          )
        ) : null}
      </div>
    </aside>
  )
}
