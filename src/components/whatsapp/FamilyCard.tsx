import { PictureOrText } from './Avatar'
import { useState } from 'react'
import { UsersThree } from '@phosphor-icons/react'
import type { Family } from '../../lib/family'
import { parentDisplayName } from '../../lib/parentLabel'
import { withCodes } from '../../lib/studentCodeLabel'
import type { Person } from '../../lib/peopleApi'
import type { LeadOption } from '../../types/domain'
import { PersonTags } from '../PersonTags'
import { useOpenChat } from '../WhatsAppLink'
import { useLeadFirstAd } from '../../lib/chatAdReferrals'
import { AdReferralLine } from './AdReferralCard'
import { canonicalPhone } from '../../lib/chatLink'

// kind says what the record is, so a child with an HOA record and a class record shows the class one. text is the
// ready-made age line ("Form 1" on a school that shows grade); when left out the card shows "<age> years".
export type ChildDetail = {
  age: number | null
  label: string | null
  kind?: 'hoa' | 'trial' | 'regular' | 'camp' | null
  text?: string | null
}

// The record that says where the child is now: a class before a camp before an HOA.
const KIND_RANK = { regular: 0, camp: 1, trial: 2, hoa: 3 } as const

type FamilyCardProps = {
  family: Family
  // What the school knows of a child besides the name: the age, and where they are (HOA, a class).
  childDetail: (person: Person) => ChildDetail
  // The chat of a WhatsApp contact, when the inbox has loaded it.
  chatOf: (contactId: number) => number | null
  onOpenChat: (conversationId: number) => void
  onOpenStudent?: (studentId: number) => void
  // The school's student code of an enrolled child, shown in front of the name (the parent shows their children's).
  codeOf?: (person: Person) => string | null
  // A person's WhatsApp picture (by their chat contact), in place of the initials when there is one.
  pictureOf?: (person: Person) => string | null
  // The tags of the parent and of each child (the same tags the leads use). Left out where tags are not offered.
  tags?: {
    options: LeadOption[]
    canEdit: (person: Person) => boolean
    // Resolves when the tags are saved and the family is read again.
    onChange: (person: Person, tagIds: number[]) => Promise<void>
    onCreate: (label: string, color: string) => Promise<LeadOption | null>
  }
}

function nameOf(person: Person) {
  if (person.name?.trim()) {
    return person.name.trim()
  }
  if (person.phone) {
    return `+${person.phone}`
  }
  return person.kind === 'student' ? 'Student (no name yet)' : 'Parent (no name yet)'
}

// A parent with no real name is called by the children: "KEW KAYDEN's Parent".
function parentNameOf(parent: Person, children: Person[]) {
  return parentDisplayName(parent.name, children.map((child) => child.name)) ?? nameOf(parent)
}

function initialsOf(person: Person, shown?: string) {
  const letters = (shown ?? nameOf(person)).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/)
  return (letters.length > 1 ? letters[0][0] + letters[letters.length - 1][0] : (letters[0] ?? '?').slice(0, 2)).toUpperCase()
}

// A child who did the HOA and then joined a class has one student record for each. They are one child.
function groupChildren(children: Person[]) {
  const groups: { key: string; people: Person[] }[] = []
  for (const child of children) {
    const key = (child.name ?? '').toLowerCase().replace(/[\s\p{P}]/gu, '')
    const found = key ? groups.find((group) => group.key === key) : undefined
    if (found) {
      found.people.push(child)
    } else {
      groups.push({ key: key || `person-${child.id}`, people: [child] })
    }
  }
  return groups
}

const rowClass = 'flex items-center gap-2.5 rounded-lg border border-slate-200 p-2'
const thisChatClass = 'border-[#fc0c97]/40 bg-[#fff1f8]'
const linkClass = 'font-medium text-[#be185d] hover:underline'

// The family around the open chat: the parent, their children, and the way to the other chats of the
// family. It is what the family table says, so the team sees one place instead of several boxes.
export function FamilyCard({ family, childDetail, chatOf, onOpenChat, onOpenStudent, codeOf, tags, pictureOf }: FamilyCardProps) {
  // The tags just chosen show at once, until they are saved and the family is read again.
  const [chosen, setChosen] = useState<Map<number, number[]>>(new Map())
  // Opens a number's chat on the school's inbox page (null where there is none, e.g. in tests).
  const openChat = useOpenChat()
  // The ad the family's lead first clicked, when there is one.
  const firstAd = useLeadFirstAd(family.leadId)

  // Tags belong to the family: the parent has the one bar the team edits (at the top of the card). A child keeps
  // the tags already on them, shown as small chips that cannot be changed here (the student page still edits them).
  function tagLine(person: Person, editable: boolean) {
    if (!tags) {
      return null
    }
    const canEdit = editable && tags.canEdit(person)
    const selected = chosen.get(person.id) ?? person.tagIds ?? []
    if (!canEdit && selected.length === 0) {
      return null
    }
    return (
      <div className={editable ? 'pl-1' : 'mt-1 pl-1'}>
        <PersonTags
          tags={tags.options}
          selectedIds={selected}
          canEdit={canEdit}
          compact
          showLabel={false}
          onChange={(ids) => {
            setChosen((current) => new Map(current).set(person.id, ids))
            void tags.onChange(person, ids).finally(() =>
              setChosen((current) => {
                const next = new Map(current)
                next.delete(person.id)
                return next
              }),
            )
          }}
          onCreate={tags.onCreate}
        />
      </div>
    )
  }

  function openChatLink(person: Person) {
    const chat = person.contactId !== null ? chatOf(person.contactId) : null
    if (person.id === family.me.id) {
      return null
    }
    if (chat === null) {
      // A child with a number of their own (not the parent's, not this chat's) but no chat here yet: open theirs by
      // the number (found under a hidden ID too), or start a new one.
      const own = canonicalPhone(person.phone)
      const taken = [family.parent?.phone, family.me.phone].map((value) => canonicalPhone(value))
      if (person.kind !== 'student' || !openChat || own === null || taken.includes(own)) {
        return null
      }
      return (
        <button
          type="button"
          onClick={() => openChat({ phone: own, name: person.name ?? null, leadId: null, ownNumberOnly: true })}
          className={linkClass}
        >
          Open chat
        </button>
      )
    }
    return (
      <button type="button" onClick={() => onOpenChat(chat)} className={linkClass}>
        Open chat
      </button>
    )
  }

  const { me, parent } = family
  const codesOf = (people: Person[]) => people.map((person) => codeOf?.(person) ?? null)

  return (
    <section aria-label="Family" className="space-y-2 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-slate-700">
        <UsersThree size={14} aria-hidden="true" />
        Family
      </p>

      {parent ? tagLine(parent, true) : null}
      <AdReferralLine ad={firstAd} className="rounded-lg bg-amber-50/60 px-2 py-1" />

      {parent ? (
        <div>
          <div className={`${rowClass} ${parent.id === me.id ? thisChatClass : ''}`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
              <PictureOrText src={pictureOf?.(parent)} text={initialsOf(parent, parentNameOf(parent, family.children))} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-sm font-medium text-slate-900"
                title={withCodes(parentNameOf(parent, family.children), codesOf(family.children))}
              >
                {withCodes(parentNameOf(parent, family.children), codesOf(family.children))}
              </span>
              <span className="block truncate text-slate-500">
                Parent{parent.phone ? ` · +${parent.phone}` : parent.contactId !== null ? ' · number hidden by WhatsApp' : ''}
              </span>
            </span>
            {parent.id === me.id ? (
              <span className="rounded-full bg-[#ffe4f2] px-2 py-0.5 text-[11px] font-medium text-[#be185d]">This chat</span>
            ) : (
              openChatLink(parent)
            )}
          </div>
        </div>
      ) : (
        <div className={`${rowClass} border-dashed`}>
          <span className="min-w-0 flex-1 text-slate-500">
            <span className="block text-sm">Parent not saved yet</span>
            <span className="block">Add the parent&apos;s name and number in the lead details below.</span>
          </span>
        </div>
      )}

      {family.otherParentChats.length > 0 && (
        <ul className="space-y-1">
          {family.otherParentChats.map((other) => (
            <li key={other.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">
              <span className="truncate">The same parent has another chat{other.phone ? ` (+${other.phone})` : ''}</span>
              {openChatLink(other)}
            </li>
          ))}
        </ul>
      )}

      {family.children.length > 0 && (
        <ul className="ml-4 space-y-1.5 border-l border-slate-200 pl-3">
          {groupChildren(family.children).map((group) => {
            const details = group.people.map((child) => ({ child, ...childDetail(child) }))
            const first = group.people[0]
            const isMe = group.people.some((child) => child.id === me.id)
            const age = details.map((detail) => detail.age).find((value) => value !== null) ?? null
            const ageText = details.map((detail) => detail.text).find((value) => value) ?? (age !== null ? `${age} years` : null)
            const ranked = [...details].sort(
              (a, b) => (a.kind ? KIND_RANK[a.kind] : 9) - (b.kind ? KIND_RANK[b.kind] : 9),
            )
            const current = ranked[0]
            const tagPerson = group.people.find((child) => child.studentId !== null) ?? first
            const didHoa = details.length > 1 && details.some((detail) => detail.kind === 'hoa' || detail.kind === 'trial')
              && current.kind !== 'hoa' && current.kind !== 'trial'
            return (
              <li key={group.key}>
                <div className={`${rowClass} ${isMe ? thisChatClass : ''}`}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                    {initialsOf(first)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900" title={withCodes(nameOf(first), codesOf(group.people))}>
                      {withCodes(nameOf(first), codesOf(group.people))}
                    </span>
                    <span className="block truncate text-slate-500">
                      {[ageText, current.label, didHoa ? 'did the HOA first' : null]
                        .filter(Boolean)
                        .join(' · ') || 'Student'}
                    </span>
                  </span>
                  {isMe ? (
                    <span className="rounded-full bg-[#ffe4f2] px-2 py-0.5 text-[11px] font-medium text-[#be185d]">This chat</span>
                  ) : null}
                </div>
                {tagLine(tagPerson, false)}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-1">
                  {current.child.studentId !== null && onOpenStudent ? (
                    <button type="button" onClick={() => onOpenStudent(current.child.studentId as number)} className={linkClass}>
                      Student Progress
                    </button>
                  ) : null}
                  {group.people.map((child) => (
                    <span key={`chat-${child.id}`}>{openChatLink(child)}</span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}

    </section>
  )
}
