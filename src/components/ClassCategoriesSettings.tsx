import { useState } from 'react'
import { Eye, EyeSlash, Plus } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import {
  classCategoryKinds,
  saveClassCategory,
  sortClassCategories,
  useClassCategories,
  type ClassCategory,
} from '../lib/classCategories'
import type { ClassroomCategory } from '../types/domain'

type Changes = Partial<ClassCategory>

// Class Settings > Class options: the tabs of My Classroom. The school adds,
// renames, orders and hides them; each one works like a regular, trial or camp class.
export function ClassCategoriesSettings({
  // For tests; the page saves through the database.
  save = saveClassCategory,
}: {
  save?: (category: ClassCategory | null, changes: Changes) => Promise<string | null>
}) {
  const { categories, fromDatabase } = useClassCategories()
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<ClassroomCategory>('regular')
  const sorted = sortClassCategories(categories)
  const shown = sorted.filter((category) => category.isActive)

  async function run(category: ClassCategory | null, changes: Changes) {
    const failure = await save(category, changes)
    setError(failure)
    return failure === null
  }

  async function move(category: ClassCategory, direction: -1 | 1) {
    const index = shown.findIndex((entry) => entry.name === category.name)
    const other = shown[index + direction]
    if (!other) return
    const mine = category.sortOrder === other.sortOrder ? category.sortOrder + direction : other.sortOrder
    if (await run(category, { sortOrder: mine })) await run(other, { sortOrder: category.sortOrder })
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Class categories</h3>
        <p className="text-sm text-slate-500">
          The tabs of My Classroom (e.g. Regular Class, Trial Class). Each class is put in one in its Edit Classroom
          form. Renaming one renames it on every class; hidden ones stay on the classes that use them.
        </p>
      </div>
      {!fromDatabase && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          These are the usual three. They can be changed after the database update.
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <ul className="space-y-2">
        {sorted.map((category) => (
          <CategoryRow
            key={`${category.name}-${category.kind}-${category.isActive}-${category.sortOrder}`}
            category={category}
            disabled={!fromDatabase}
            canMoveUp={category.isActive && shown[0]?.name !== category.name}
            canMoveDown={category.isActive && shown[shown.length - 1]?.name !== category.name}
            onSave={(changes) => run(category, changes)}
            onMove={(direction) => void move(category, direction)}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          maxLength={40}
          disabled={!fromDatabase}
          placeholder="New category, e.g. Exam Prep"
          aria-label="New class category name"
          onChange={(event) => setNewName(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <KindSelect value={newKind} disabled={!fromDatabase} label="New class category works like" onChange={setNewKind} />
        <button
          type="button"
          disabled={!fromDatabase || !newName.trim()}
          onClick={() => void run(null, { name: newName.trim(), kind: newKind }).then((ok) => ok && setNewName(''))}
          aria-label="Add class category"
          className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  )
}

function KindSelect({
  value,
  label,
  disabled,
  onChange,
}: {
  value: ClassroomCategory
  label: string
  disabled?: boolean
  onChange: (kind: ClassroomCategory) => void
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as ClassroomCategory)}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
    >
      {classCategoryKinds.map((entry) => (
        <option key={entry.kind} value={entry.kind}>
          Works like: {entry.label}
        </option>
      ))}
    </select>
  )
}

function CategoryRow({
  category,
  disabled,
  canMoveUp,
  canMoveDown,
  onSave,
  onMove,
}: {
  category: ClassCategory
  disabled: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSave: (changes: Changes) => Promise<boolean>
  onMove: (direction: -1 | 1) => void
}) {
  const [name, setName] = useState(category.name)
  const dirty = name.trim() !== category.name

  return (
    <li className={cn('flex flex-wrap items-center gap-2', !category.isActive && 'opacity-60')}>
      <input
        type="text"
        value={name}
        maxLength={40}
        disabled={disabled}
        aria-label={`${category.name} name`}
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
      <KindSelect
        value={category.kind}
        disabled={disabled}
        label={`${category.name} works like`}
        onChange={(kind) => {
          if (window.confirm(`Every class in "${category.name}" will then work like this kind of class. Change it?`)) {
            void onSave({ kind })
          }
        }}
      />
      <button
        type="button"
        disabled={disabled || !canMoveUp}
        onClick={() => onMove(-1)}
        aria-label={`Move ${category.name} up`}
        className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={disabled || !canMoveDown}
        onClick={() => onMove(1)}
        aria-label={`Move ${category.name} down`}
        className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onSave({ isActive: !category.isActive })}
        aria-label={category.isActive ? `Hide ${category.name}` : `Show ${category.name}`}
        className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
      >
        {category.isActive ? <Eye size={16} aria-hidden="true" /> : <EyeSlash size={16} aria-hidden="true" />}
      </button>
    </li>
  )
}
