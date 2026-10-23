import { useState } from 'react'
import { Eye, EyeSlash, Plus } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { sortClassCategories, useClassCategories } from '../lib/classCategories'
import type { StudentFieldsSetting } from '../lib/studentFields'
import {
  fetchFieldOptions,
  ROSTER_LIST_FIELDS,
  saveFieldOption,
  saveRosterCounts,
  sortFieldOptions,
  type FieldOption,
  type RosterCounts,
  type RosterListField,
} from '../lib/studentRoster'

export type RosterFieldsApi = {
  fetchOptions: typeof fetchFieldOptions
  saveOption: typeof saveFieldOption
  saveCounts: typeof saveRosterCounts
}

const databaseApi: RosterFieldsApi = { fetchOptions: fetchFieldOptions, saveOption: saveFieldOption, saveCounts: saveRosterCounts }

// Class Settings > Student fields, the roster part: the choices of each roster list the school shows (added, renamed,
// ordered and hidden), and how the roster table counts subjects.
export function RosterFieldsSettings({
  setting,
  options,
  onOptionsChange,
  counts,
  onCountsChange,
  api = databaseApi,
}: {
  setting: StudentFieldsSetting
  options: FieldOption[]
  onOptionsChange: (options: FieldOption[]) => void
  counts: RosterCounts
  onCountsChange: (counts: RosterCounts) => void
  api?: RosterFieldsApi
}) {
  const [error, setError] = useState<string | null>(null)
  const lists = ROSTER_LIST_FIELDS.filter((entry) => setting[entry.field])
  if (lists.length === 0 && !setting.roster_table) return null

  async function run(field: RosterListField, current: FieldOption | null, changes: Partial<FieldOption>) {
    const failure = await api.saveOption(field, current, changes)
    setError(failure)
    if (failure) return false
    onOptionsChange(await api.fetchOptions())
    return true
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {lists.map((entry) => (
        <OptionList
          key={entry.field}
          label={entry.label}
          field={entry.field}
          options={sortFieldOptions(options.filter((option) => option.field === entry.field))}
          onSave={(current, changes) => run(entry.field, current, changes)}
        />
      ))}
      {setting.roster_table && <CountsCard counts={counts} onChange={onCountsChange} saveCounts={api.saveCounts} />}
    </div>
  )
}

function OptionList({
  label,
  field,
  options,
  onSave,
}: {
  label: string
  field: RosterListField
  options: FieldOption[]
  onSave: (current: FieldOption | null, changes: Partial<FieldOption>) => Promise<boolean>
}) {
  const [newName, setNewName] = useState('')
  const shown = options.filter((option) => option.isActive)

  async function move(option: FieldOption, direction: -1 | 1) {
    const index = shown.findIndex((entry) => entry.name === option.name)
    const other = shown[index + direction]
    if (!other) return
    const mine = option.sortOrder === other.sortOrder ? option.sortOrder + direction : other.sortOrder
    if (await onSave(option, { sortOrder: mine })) await onSave(other, { sortOrder: option.sortOrder })
  }

  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Choices for &quot;{label}&quot;</h4>
        <p className="text-xs text-slate-500">Renaming one renames it on every student; hidden ones stay on the students that have them.</p>
      </div>
      <ul className="space-y-2">
        {options.map((option) => (
          <OptionRow
            key={`${option.name}-${option.isActive}-${option.sortOrder}`}
            option={option}
            canMoveUp={option.isActive && shown[0]?.name !== option.name}
            canMoveDown={option.isActive && shown[shown.length - 1]?.name !== option.name}
            onSave={(changes) => onSave(option, changes)}
            onMove={(direction) => void move(option, direction)}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          maxLength={60}
          placeholder="New choice"
          aria-label={`New choice for ${label}`}
          onChange={(event) => setNewName(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => void onSave(null, { field, name: newName.trim() }).then((ok) => ok && setNewName(''))}
          aria-label={`Add choice for ${label}`}
          className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  )
}

function OptionRow({
  option,
  canMoveUp,
  canMoveDown,
  onSave,
  onMove,
}: {
  option: FieldOption
  canMoveUp: boolean
  canMoveDown: boolean
  onSave: (changes: Partial<FieldOption>) => Promise<boolean>
  onMove: (direction: -1 | 1) => void
}) {
  const [name, setName] = useState(option.name)
  const dirty = name.trim() !== option.name && name.trim() !== ''

  return (
    <li className={cn('flex flex-wrap items-center gap-2', !option.isActive && 'opacity-60')}>
      <input
        type="text"
        value={name}
        maxLength={60}
        aria-label={`Choice ${option.name}`}
        onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      {dirty && (
        <button type="button" onClick={() => void onSave({ name: name.trim() })} className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white">
          Rename
        </button>
      )}
      <button
        type="button"
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
        aria-label={`Move ${option.name} up`}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
        aria-label={`Move ${option.name} down`}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={() => void onSave({ isActive: !option.isActive })}
        aria-label={option.isActive ? `Hide ${option.name}` : `Show ${option.name}`}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
      >
        {option.isActive ? <EyeSlash size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        {option.isActive ? 'Hide' : 'Show'}
      </button>
    </li>
  )
}

// Which class categories count as subjects, and from which day class changes are counted.
function CountsCard({
  counts,
  onChange,
  saveCounts,
}: {
  counts: RosterCounts
  onChange: (counts: RosterCounts) => void
  saveCounts: RosterFieldsApi['saveCounts']
}) {
  const { categories } = useClassCategories()
  const [picked, setPicked] = useState(counts.countCategories)
  const [from, setFrom] = useState(counts.changesFrom ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = JSON.stringify([...picked].sort()) !== JSON.stringify([...counts.countCategories].sort()) || from !== (counts.changesFrom ?? '')

  async function save() {
    setBusy(true)
    const next = { countCategories: picked, changesFrom: from || null }
    const failure = await saveCounts(next)
    setBusy(false)
    if (failure) {
      setMessage({ ok: false, text: failure })
      return
    }
    onChange(next)
    setMessage({ ok: true, text: 'Saved.' })
  }

  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">How the roster table counts subjects</h4>
        <p className="text-xs text-slate-500">
          Number of subjects: the subjects a student takes in the ticked class categories (two classes of one subject count once). With none ticked, every
          category that works like a regular class counts. Stopped / added: classes left / joined from the date below to today; changing class is one
          stopped and one added.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {sortClassCategories(categories).map((category) => (
          <label key={category.name} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={picked.includes(category.name)}
              onChange={() => setPicked((current) => (current.includes(category.name) ? current.filter((name) => name !== category.name) : [...current, category.name]))}
            />
            {category.name}
          </label>
        ))}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        Count class changes from
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-label="Count class changes from"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <span className="text-xs text-slate-500">(empty: 1 January of this year)</span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        {message && <span className={cn('text-xs', message.ok ? 'text-emerald-700' : 'text-red-700')}>{message.text}</span>}
      </div>
    </div>
  )
}
