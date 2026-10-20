import { useState } from 'react'
import { UsersThree } from '@phosphor-icons/react'
import type { Family } from '../../lib/family'
import type { Person } from '../../lib/peopleApi'
import type { LeadOption } from '../../types/domain'
import { PersonTags } from '../PersonTags'

// kind says what the record is, so a child with an HOA record and a class record shows the class one.
export type ChildDetail = { age: number | null; label: string | null; kind?: 'hoa' | 'trial' | 'regular' | 'camp' | null }

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

function initialsOf(person: Person) {
  const letters = nameOf(person).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/)
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
export function FamilyCard({ family, childDetail, chatOf, onOpenChat, onOpenStudent, tags }: FamilyCardProps) {
  // The tags just chosen show at once, until they are saved and the family is read again.
  const [chosen, setChosen] = useState<Map<number, number[]>>(new Map())

  // A person with tags, or one the team may tag, gets the tag line under their row.
  function tagLine(person: Person) {
    if (!tags) {
      return null
    }
    const canEdit = tags.canEdit(person)
    const selected = chosen.get(person.id) ?? person.tagIds ?? []
    if (!canEdit && selected.length === 0) {
      return null
    }
    return (
      <div className="mt-1 pl-1">
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
    if (chat === null || person.id === family.me.id) {
      return null
    }
    return (
      <button type="button" onClick={() => onOpenChat(chat)} className={linkClass}>
        Open chat
      </button>
    )
  }

  const { me, parent } = family

  return (
    <section aria-label="Family" className="space-y-2 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-slate-700">
        <UsersThree size={14} aria-hidden="true" />
        Family
      </p>

      {parent ? (
        <div>
          <div className={`${rowClass} ${parent.id === me.id ? thisChatClass : ''}`}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
              {initialsOf(parent)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{nameOf(parent)}</span>
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
          {tagLine(parent)}
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
                    <span className="block truncate text-sm font-medium text-slate-900">{nameOf(first)}</span>
                    <span className="block truncate text-slate-500">
                      {[age !== null ? `${age} years` : null, current.label, didHoa ? 'did the HOA first' : null]
                        .filter(Boolean)
                        .join(' · ') || 'Student'}
                    </span>
                  </span>
                  {isMe ? (
                    <span className="rounded-full bg-[#ffe4f2] px-2 py-0.5 text-[11px] font-medium text-[#be185d]">This chat</span>
                  ) : null}
                </div>
                {tagLine(tagPerson)}
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
