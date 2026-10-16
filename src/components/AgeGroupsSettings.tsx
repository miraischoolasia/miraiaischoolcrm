import { useState } from 'react'
import { Eye, EyeSlash, Plus } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import type { AgeGroupOption } from '../lib/ageGroups'

type AgeGroupChanges = Partial<AgeGroupOption>

// Class Settings > Subjects & ages: the age groups classes are sorted by and
// questions are made for. Renaming one renames it on every class and question.
export function AgeGroupsSettings({
  groups,
  onSave,
  title = 'Age groups',
  description = 'How classes are grouped in My Classroom, and which ages a question suits. Renaming one renames it on every class and question.',
  placeholder = 'New age group, e.g. Primary 1-3',
  noun = 'age group',
}: {
  groups: AgeGroupOption[]
  // The same editor serves class levels.
  title?: string
  description?: string
  placeholder?: string
  noun?: string
  // Adds (group null) or changes one; resolves to an error message, or null.
  onSave: (group: AgeGroupOption | null, changes: AgeGroupChanges) => Promise<string | null>
}) {
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const sorted = [...groups].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
  const shown = sorted.filter((group) => group.isActive)

  async function run(group: AgeGroupOption | null, changes: AgeGroupChanges) {
    const failure = await onSave(group, changes)
    setError(failure)
    return failure === null
  }

  // Swaps the order with the next shown group up or down.
  async function move(group: AgeGroupOption, direction: -1 | 1) {
    const index = shown.findIndex((entry) => entry.name === group.name)
    const other = shown[index + direction]
    if (!other) return
    const mine = group.sortOrder === other.sortOrder ? group.sortOrder + direction : other.sortOrder
    if (await run(group, { sortOrder: mine })) await run(other, { sortOrder: group.sortOrder })
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <ul className="space-y-2">
        {sorted.map((group) => (
          <AgeGroupRow
            key={`${group.name}-${group.isActive}-${group.sortOrder}`}
            group={group}
            canMoveUp={group.isActive && shown[0]?.name !== group.name}
            canMoveDown={group.isActive && shown[shown.length - 1]?.name !== group.name}
            onSave={(changes) => run(group, changes)}
            onMove={(direction) => void move(group, direction)}
          />
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          maxLength={40}
          placeholder={placeholder}
          aria-label={`New ${noun} name`}
          onChange={(event) => setNewName(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => void run(null, { name: newName.trim() }).then((ok) => ok && setNewName(''))}
          aria-label={`Add ${noun}`}
          className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  )
}

function AgeGroupRow({
  group,
  canMoveUp,
  canMoveDown,
  onSave,
  onMove,
}: {
  group: AgeGroupOption
  canMoveUp: boolean
  canMoveDown: boolean
  onSave: (changes: AgeGroupChanges) => Promise<boolean>
  onMove: (direction: -1 | 1) => void
}) {
  const [name, setName] = useState(group.name)
  const dirty = name.trim() !== group.name

  return (
    <li className={cn('flex items-center gap-2', !group.isActive && 'opacity-60')}>
      <input
        type="text"
        value={name}
        maxLength={40}
        aria-label={`${group.name} name`}
        onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      {dirty && (
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => void onSave({ name: name.trim() })}
          className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      )}
      <button
        type="button"
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
        aria-label={`Move ${group.name} up`}
        className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
        aria-label={`Move ${group.name} down`}
        className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={() => void onSave({ isActive: !group.isActive })}
        aria-label={group.isActive ? `Hide ${group.name}` : `Show ${group.name}`}
        className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
      >
        {group.isActive ? <Eye size={16} aria-hidden="true" /> : <EyeSlash size={16} aria-hidden="true" />}
      </button>
    </li>
  )
}
