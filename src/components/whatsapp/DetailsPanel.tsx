import { useMemo, useState } from 'react'
import { CaretLeft, GraduationCap, Star, UserCircle } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { getFirstMessage, guessSourceAndTags, parentNumberUpdate, resolveChatLead } from '../../lib/chatLink'
import { parentPhoneOf } from '../../lib/studentContact'
import { familyOf } from '../../lib/family'
import type { Person } from '../../lib/peopleApi'
import { FamilyCard } from './FamilyCard'
import { describeStudent, getStudentKind, makeStudentResolver } from '../../lib/studentLink'
import type { SourceRule } from '../../lib/sourceRules'
import {
  formatListTime,
  getHiddenNumberName,
  isGroupChat,
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
import { CampEnrolPanel } from './CampEnrolPanel'
import { ProgrammePanel } from './ProgrammePanel'
import { ClassSignUp } from './ClassSignUp'
import { ProgrammePicker } from './ProgrammePicker'
import { useFollowedProgrammes } from '../../hooks/useFollowedProgrammes'
import { activeProgrammes, type Programme } from '../../lib/programmes'
import { StudentCard } from './StudentCard'
import { StudentLinker } from './StudentLinker'
import { ChatRolePicker } from './ChatRolePicker'
import type { Lead, Student } from '../../types/domain'
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
  // The WhatsApp numbers this parent has written to, in the order of their first chat on each.
  numbersContacted?: { inboxId: number; label: string; since: number }[]
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
  // The family table, and the way from a WhatsApp contact to its chat, for the family card.
  people?: Person[]
  chatOfContact?: (contactId: number) => number | null
}

// The side panel: who the parent is, and what the school already knows about
// them (a lead, a student), or a way to add them.
// Which sign-up the steps below are for: one of the school's programmes.
type PanelTab = 'contact' | 'enrol' | 'chat'

const TAB_ICONS: Record<PanelTab, { label: string; Icon: typeof UserCircle }> = {
  contact: { label: 'Contact', Icon: UserCircle },
  enrol: { label: 'Sign-up', Icon: GraduationCap },
  chat: { label: 'Chat notes', Icon: Star },
}

// An offer is one of Mirai's own courses (HOA class, Holiday Camp), or 'class': any class with an
// enrolment flow, picked by grade, subject and class (the flow comes from the class).
type Offer = { key: string; label: string; legacy: 'hoa' | 'camp' | null; programme: Programme | null }

function ProgrammeSwitch({
  offers,
  current,
  followed,
  onChange,
}: {
  offers: Offer[]
  current: string
  followed: ReadonlySet<string>
  onChange: (key: string) => void
}) {
  if (offers.length < 2) {
    return null
  }
  // Many programmes: the ones the lead is on are tabs, and the rest are found by searching, grouped by category.
  if (offers.length > 3) {
    return (
      <ProgrammePicker
        offers={offers.map((offer) => ({ key: offer.key, name: offer.label, category: offer.programme?.category ?? null }))}
        current={current}
        followed={followed}
        onChange={onChange}
      />
    )
  }
  return (
    <div
      role="group"
      aria-label="What are they signing up for"
      className="grid gap-1 rounded-lg bg-slate-100 p-1"
      style={{ gridTemplateColumns: `repeat(${offers.length}, minmax(0, 1fr))` }}
    >
      {offers.map((offer) => (
        <button
          key={offer.key}
          type="button"
          aria-pressed={current === offer.key}
          onClick={() => onChange(offer.key)}
          className={`rounded-md px-2 py-1.5 text-xs font-semibold ${
            current === offer.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {offer.label}
        </button>
      ))}
    </div>
  )
}

// What the "sign up for another" line says: the one programme there is, or all of them.
function enrolAnotherLabel(offers: Offer[], forStudent: boolean) {
  const names = offers.map((entry) => (entry.legacy === 'hoa' ? 'HOA' : entry.key === 'class' ? 'a class' : entry.label))
  if (names.length === 1) {
    return forStudent ? `Sign up for another ${offers[0].legacy === 'hoa' ? 'HOA class' : names[0]}` : `Enrol another child in ${names[0]}`
  }
  const start = forStudent ? 'Sign up for another course' : 'Enrol another child'
  return names.length === 0 ? start : `${start} (${names.join(' or ')})`
}

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
  numbersContacted = [],
  otherChats = [],
  onOpenChat,
  whatsappLabels = [],
  starredMessages = [],
  onUnstar,
  onBack,
  people = [],
  chatOfContact = () => null,
}: DetailsPanelProps) {
  const sender = conversation.meta.sender
  const phone = getRealPhone(sender.phone_number)

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
  // The part of the panel on show, chosen on the icons at its right edge.
  const [tab, setTab] = useState<PanelTab>('contact')
  // What the parent can sign up for: the school's programmes that are on. A crm without programmes (the
  // tests) offers Mirai's two, the HOA class and the Holiday Camp (when there is a camp package).
  const offers: Offer[] = useMemo(() => {
    if (crm.programmes) {
      const active = activeProgrammes(crm.programmes)
      const flowIds = new Set(active.filter((programme) => programme.legacyKey === null).map((programme) => programme.id))
      const signUpClasses = crm.classrooms.some(
        (classroom) => classroom.status === 'active' && classroom.programmeId !== null && classroom.programmeId !== undefined && flowIds.has(classroom.programmeId),
      )
      return [
        ...active
          .filter((programme) => programme.legacyKey !== null)
          .map((programme) => ({ key: String(programme.id), label: programme.name, legacy: programme.legacyKey, programme })),
        ...(signUpClasses ? [{ key: 'class', label: 'A class', legacy: null, programme: null }] : []),
      ]
    }
    const hasCamp = crm.packages.some((pkg) => pkg.kind === 'camp' && pkg.isActive)
    return [
      { key: 'hoa', label: 'HOA class', legacy: 'hoa' as const, programme: null },
      ...(hasCamp ? [{ key: 'camp', label: 'Holiday Camp', legacy: 'camp' as const, programme: null }] : []),
    ]
  }, [crm.programmes, crm.packages, crm.classrooms])
  const [offerKey, setOfferKey] = useState<string | null>(null)
  const followedProgrammes = useFollowedProgrammes({
    leadId: lead?.id ?? null,
    programmes: crm.programmes,
    bookings: crm.trialBookings,
    bookingProgrammeId: crm.bookingProgrammeId,
  })
  const offer = offers.find((entry) => entry.key === offerKey) ?? offers[0] ?? null
  const showLeadPart = lead !== null || students.length === 0 || leadFormFor === conversation.id

  // The steps of the programme the team picked, for the lead of this chat.
  function enrolBlock(forLead: Lead, write: (text: string) => void) {
    const shared = { lead: forLead, crm, userName, onWriteMessage: write, forStudent: role === 'student' }
    return (
      <>
        <ProgrammeSwitch offers={offers} current={offer?.key ?? ''} followed={followedProgrammes} onChange={setOfferKey} />
        {offer === null ? (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Nothing to sign up for yet. An admin picks an enrolment flow for each kind of class in Class Settings.
          </p>
        ) : offer.legacy === 'camp' ? (
          <CampEnrolPanel key={offer.key} {...shared} />
        ) : offer.legacy === 'hoa' ? (
          <EnrolPanel key={offer.key} {...shared} />
        ) : offer.key === 'class' ? (
          <ClassSignUp key={offer.key} {...shared} />
        ) : offer.programme ? (
          <ProgrammePanel key={offer.key} programme={offer.programme} {...shared} />
        ) : null}
      </>
    )
  }

  // A student who writes themself cannot pay or sign the registration form alone: remind the team
  // while the parent's name or number is still missing.
  const missingParent =
    role === 'student' && lead
      ? [
          !lead.fullName?.trim() ? 'name' : null,
          !parentPhoneOf(lead.phone ?? '', lead.children[0]?.phone) ? 'number' : null,
        ].filter((part): part is string => part !== null)
      : []

  // The family around this chat, from the family table.
  const family = useMemo(() => familyOf(sender.id, people), [sender.id, people])
  const familyLead = family?.leadId != null ? (crm.leads.find((entry) => entry.id === family.leadId) ?? null) : null
  function childDetail(person: Person) {
    const enrolled = person.studentId !== null ? crm.students.find((entry) => entry.id === person.studentId) : undefined
    const wanted = (person.name ?? '').toLowerCase().replace(/[\s\p{P}]/gu, '')
    const written = familyLead?.children.find(
      (child) => (child.name ?? '').toLowerCase().replace(/[\s\p{P}]/gu, '') === wanted && wanted !== '',
    )
    return {
      age: enrolled?.age ?? written?.age ?? null,
      label: enrolled ? describeStudent(enrolled, crm.packages) : null,
      kind: enrolled ? getStudentKind(enrolled, crm.packages) : null,
    }
  }
  async function addChildToLead(childName: string, age: number) {
    if (!familyLead) {
      return 'There is no lead to add the child to yet.'
    }
    return crm.onUpdateLead(familyLead.id, {
      fullName: familyLead.fullName ?? '',
      phone: familyLead.phone ?? '',
      state: familyLead.state ?? '',
      sourceId: familyLead.sourceId,
      picId: familyLead.picId,
      tagIds: familyLead.tagIds,
      status: familyLead.status,
      children: [
        ...familyLead.children.map((child) => ({ name: child.name, age: child.age, phone: child.phone })),
        { name: childName, age, phone: null },
      ],
      notes: familyLead.notes ?? '',
    })
  }

  // WhatsApp hid the number, so the name the chat shows (the username) is all there is to call the parent.
  const nameWithoutNumber = role !== 'student' ? getHiddenNumberName(sender) : ''

  const first = useMemo(() => getFirstMessage(messages), [messages])
  const guess = useMemo(() => guessSourceAndTags(first?.text ?? '', crm.leadOptions, sourceRules), [first, crm.leadOptions, sourceRules])

  // Once the family card knows who this is, the pickers that say who it is move into one folded box.
  const rolePicker = onSetRole ? (
    <ChatRolePicker
      role={role}
      studentName={childNames.length > 0 ? childNames.join(' & ') : null}
      canBeStudent={childNames.length <= 1}
      onPick={(next) => void onSetRole(next)}
    />
  ) : null
  const studentLinker = (
    <StudentLinker
      students={crm.students}
      packages={crm.packages}
      shownIds={students.map((student) => student.id)}
      isEmpty={students.length === 0}
      onLink={linkStudent}
      forStudent={role === 'student'}
    />
  )

  // A group is many people: no lead, family or student card applies to it.
  if (isGroupChat(sender)) {
    return (
      <aside className={className}>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
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
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">WhatsApp group</p>
          <p className="mt-1">
            Everyone in the group reads what the team writes here. A group is not a lead or a student, so there is no
            lead form, family card or AI suggestion for it.
          </p>
        </div>
        </div>
      </aside>
    )
  }

  const hasChatNotes = starredMessages.length > 0 || whatsappLabels.length > 0
  const canEnrol = Boolean(lead && onWriteMessage)
  const tabs: PanelTab[] = ['contact', ...(canEnrol ? (['enrol'] as const) : []), ...(hasChatNotes ? (['chat'] as const) : [])]
  const shownTab: PanelTab = tabs.includes(tab) ? tab : 'contact'

  return (
    <aside className={className}>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
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
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {shownTab === 'contact' && (
            <div className="space-y-5">
        {/* The slots below keep their place whether or not the chat is a lead yet, so the
            form is the same one before and after saving and only says "Saved". */}
        {lead ? (
          <LeadHeader lead={lead} byPhone={byPhone} isStudent={role === 'student'} onUnlink={() => void onLinkLead(null)} />
        ) : null}
        {/* Who the school already has as students comes first: a parent of a student is not a new lead. */}
        {family && onOpenChat ? (
          <FamilyCard
            family={family}
            childDetail={childDetail}
            chatOf={chatOfContact}
            onOpenChat={onOpenChat}
            onOpenStudent={crm.onOpenStudent}
            onAddChild={familyLead && crm.canEditLeads ? addChildToLead : undefined}
          />
        ) : null}
        {!family ? rolePicker : null}
        {students.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            crm={crm}
            forStudent={role === 'student'}
            onUnlink={
              linkedStudentIds.includes(student.id)
                ? () => void onLinkStudents(linkedStudentIds.filter((id) => id !== student.id))
                : undefined
            }
          />
        ))}
        {!family ? studentLinker : null}
        {family ? (
          <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-slate-600">Not right? Change who this is</summary>
            <div className="mt-3 space-y-3">
              {rolePicker}
              {studentLinker}
            </div>
          </details>
        ) : null}
        {otherChats.length > 0 && onOpenChat && !family && (
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
        {numbersContacted.length > 0 && (
          <PanelSection title="Numbers they wrote to" aside={<span className="text-slate-500">in order</span>}>
            <ol className="space-y-1.5">
              {numbersContacted.map((entry, index) => (
                <li key={entry.inboxId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <span className="min-w-0 truncate text-slate-800">
                    <span className="font-semibold text-[#be185d]">
                      {index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`}
                    </span>{' '}
                    {entry.label}
                  </span>
                  {entry.since > 0 && (
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {new Date(entry.since * 1000).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </PanelSection>
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
        {!showLeadPart ? null : lead || crm.canEditLeads ? (
          <LeadForm
            key={conversation.id}
            crm={crm}
            lead={lead}
            initialName={nameWithoutNumber}
            fallbackName={nameWithoutNumber}
            initialPhone={phone ? `+${phone}` : ''}
            guess={guess}
            role={role}
            onCreated={async (leadId) => {
              await onLinkLead(leadId)
            }}
            onFindLead={linkLead}
          />
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            This parent is not a lead yet. You can look but not add leads.
          </p>
        )}
        {lead && onWriteMessage && missingParent.length > 0 ? (
          <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            The parent's {missingParent.join(' and ')} {missingParent.length > 1 ? 'are' : 'is'} not saved yet. Payment and the
            registration form need the parent.
          </p>
        ) : null}
            </div>
          )}
          {shownTab === 'chat' && (
            <div className="space-y-5">
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
              {!hasChatNotes && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">No starred messages or phone labels on this chat.</p>}
            </div>
          )}
          {shownTab === 'enrol' && (
            <div className="space-y-5">
        {lead && onWriteMessage ? (
          isEnrolled ? (
            <details className="border-t border-pink-100 pt-4 text-xs">
              <summary className="cursor-pointer font-semibold text-[#be185d]">
                {enrolAnotherLabel(offers, role === 'student')}
              </summary>
              <div className="mt-3 space-y-3">{enrolBlock(lead, onWriteMessage)}</div>
            </details>
          ) : (
            <div className="space-y-3">{enrolBlock(lead, onWriteMessage)}</div>
          )
        ) : null}
            </div>
          )}
        </div>
      </div>
      </div>
      {tabs.length > 1 && (
          // The same column as the Inbox menu on the left (full height, light grey), with icons only.
          <nav aria-label="Panel sections" className="flex w-[58px] shrink-0 flex-col items-center gap-1.5 border-l border-slate-200 bg-slate-50 py-3">
            {tabs.map((entry) => {
              const { label, Icon } = TAB_ICONS[entry]
              return (
                <button
                  key={entry}
                  type="button"
                  aria-label={label}
                  aria-pressed={shownTab === entry}
                  title={label}
                  onClick={() => setTab(entry)}
                  className={cn(
                    'relative flex h-11 w-11 items-center justify-center rounded-xl border transition',
                    shownTab === entry
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white',
                  )}
                >
                  <Icon size={20} weight={shownTab === entry ? 'fill' : 'regular'} aria-hidden="true" />
                  {entry === 'chat' && starredMessages.length > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                      {starredMessages.length}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
      )}
    </aside>
  )
}
