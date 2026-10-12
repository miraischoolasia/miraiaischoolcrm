import { useState } from 'react'
import { Plus, UsersThree } from '@phosphor-icons/react'
import { leadChildAgeOptions } from '../../lib/constants'
import type { Family } from '../../lib/family'
import type { Person } from '../../lib/peopleApi'

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
  // Present only when there is a lead to add the child to and the person may edit it.
  // Resolves to a problem to show, or null when it worked.
  onAddChild?: (name: string, age: number) => Promise<string | null>
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
export function FamilyCard({ family, childDetail, chatOf, onOpenChat, onOpenStudent, onAddChild }: FamilyCardProps) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function addChild() {
    if (!onAddChild || !name.trim() || !age) {
      setProblem("Write the child's name and choose the age.")
      return
    }
    setSaving(true)
    setProblem(null)
    const result = await onAddChild(name.trim(), Number(age))
    setSaving(false)
    if (result) {
      setProblem(result)
      return
    }
    setName('')
    setAge('')
    setAdding(false)
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

      {onAddChild &&
        (adding ? (
          <div className="ml-4 space-y-1.5 border-l border-slate-200 pl-3">
            <div className="grid grid-cols-[1fr_72px] gap-1.5">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Child's name"
                aria-label="New child name"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
              />
              <select
                value={age}
                onChange={(event) => setAge(event.target.value)}
                aria-label="New child age"
                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
              >
                <option value="">Age</option>
                {leadChildAgeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            {problem && (
              <p role="alert" className="text-red-600">
                {problem}
              </p>
            )}
            <div className="flex gap-3">
              <button type="button" disabled={saving} onClick={() => void addChild()} className={linkClass}>
                {saving ? 'Adding...' : 'Add child'}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-slate-500 hover:underline">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`ml-4 inline-flex items-center gap-1 ${linkClass}`}>
            <Plus size={12} aria-hidden="true" />
            Add a child
          </button>
        ))}
    </section>
  )
}
