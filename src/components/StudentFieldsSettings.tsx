import { useEffect, useState } from 'react'
import { Eye, EyeSlash, Plus } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import {
  fetchStudentKinds,
  saveStudentKind,
  setStudentFields,
  sortStudentKinds,
  STUDENT_FIELD_KEYS,
  STUDENT_FIELD_LABELS,
  type StudentFieldsSetting,
  type StudentKind,
} from '../lib/studentFields'

export type StudentFieldsApi = {
  setFields: typeof setStudentFields
  fetchKinds: typeof fetchStudentKinds
  saveKind: typeof saveStudentKind
}

const databaseApi: StudentFieldsApi = { setFields: setStudentFields, fetchKinds: fetchStudentKinds, saveKind: saveStudentKind }

// Class Settings > Student fields: which of the four extra fields the school shows on
// a student, and the school's own kinds of student (added, renamed, ordered, hidden).
export function StudentFieldsSettings({
  setting,
  onSettingChange,
  onKindsChange,
  // The database unless a demo passes its own.
  api = databaseApi,
}: {
  setting: StudentFieldsSetting
  onSettingChange: (setting: StudentFieldsSetting) => void
  onKindsChange?: (kinds: StudentKind[]) => void
  api?: StudentFieldsApi
}) {
  const [kinds, setKinds] = useState<StudentKind[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    let alive = true
    void api.fetchKinds().then((next) => {
      if (!alive) return
      setKinds(next)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [api])

  async function toggle(key: keyof StudentFieldsSetting) {
    const next = { ...setting, [key]: !setting[key] }
    setBusy(true)
    const failure = await api.setFields(next)
    setBusy(false)
    setError(failure)
    if (!failure) onSettingChange(next)
  }

  async function runKind(current: StudentKind | null, changes: Partial<StudentKind>) {
    const failure = await api.saveKind(current, changes)
    setError(failure)
    if (failure) return false
    const next = await api.fetchKinds()
    setKinds(next)
    onKindsChange?.(next)
    return true
  }

  const sorted = sortStudentKinds(kinds)
  const shown = sorted.filter((kind) => kind.isActive)

  async function move(kind: StudentKind, direction: -1 | 1) {
    const index = shown.findIndex((entry) => entry.name === kind.name)
    const other = shown[index + direction]
    if (!other) return
    const mine = kind.sortOrder === other.sortOrder ? kind.sortOrder + direction : other.sortOrder
    if (await runKind(kind, { sortOrder: mine })) await runKind(other, { sortOrder: kind.sortOrder })
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Student fields</h3>
        <p className="text-sm text-slate-500">
          Extra things kept on each student. Ticked ones show on the student&apos;s profile, the Edit and New Student forms, and as filters on the
          student list.
        </p>
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {STUDENT_FIELD_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={setting[key]} disabled={busy} onChange={() => void toggle(key)} />
            {STUDENT_FIELD_LABELS[key]}
          </label>
        ))}
      </div>

      {setting.student_kind && (
        <div className="space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Kinds of student</h4>
            <p className="text-xs text-slate-500">
              The choices for &quot;Kind of student&quot;. Renaming one renames it on every student; hidden ones stay on the students that have them.
            </p>
          </div>
          {loaded && kinds.length === 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The kinds of student can be set after the database update.
            </p>
          )}
          <ul className="space-y-2">
            {sorted.map((kind) => (
              <KindRow
                key={`${kind.name}-${kind.isActive}-${kind.sortOrder}`}
                kind={kind}
                canMoveUp={kind.isActive && shown[0]?.name !== kind.name}
                canMoveDown={kind.isActive && shown[shown.length - 1]?.name !== kind.name}
                onSave={(changes) => runKind(kind, changes)}
                onMove={(direction) => void move(kind, direction)}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newName}
              maxLength={40}
              placeholder="New kind, e.g. 转校生"
              aria-label="New kind of student"
              onChange={(event) => setNewName(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={() => void runKind(null, { name: newName.trim() }).then((ok) => ok && setNewName(''))}
              aria-label="Add kind of student"
              className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
            >
              <Plus size={14} aria-hidden="true" />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function KindRow({
  kind,
  canMoveUp,
  canMoveDown,
  onSave,
  onMove,
}: {
  kind: StudentKind
  canMoveUp: boolean
  canMoveDown: boolean
  onSave: (changes: Partial<StudentKind>) => Promise<boolean>
  onMove: (direction: -1 | 1) => void
}) {
  const [name, setName] = useState(kind.name)
  const dirty = name.trim() !== kind.name && name.trim() !== ''

  return (
    <li className={cn('flex flex-wrap items-center gap-2', !kind.isActive && 'opacity-60')}>
      <input
        type="text"
        value={name}
        maxLength={40}
        aria-label={`Kind of student ${kind.name}`}
        onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      {dirty && (
        <button
          type="button"
          onClick={() => void onSave({ name: name.trim() })}
          className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white"
        >
          Rename
        </button>
      )}
      <button
        type="button"
        disabled={!canMoveUp}
        onClick={() => onMove(-1)}
        aria-label={`Move ${kind.name} up`}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="button"
        disabled={!canMoveDown}
        onClick={() => onMove(1)}
        aria-label={`Move ${kind.name} down`}
        className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={() => void onSave({ isActive: !kind.isActive })}
        aria-label={kind.isActive ? `Hide ${kind.name}` : `Show ${kind.name}`}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
      >
        {kind.isActive ? <EyeSlash size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        {kind.isActive ? 'Hide' : 'Show'}
      </button>
    </li>
  )
}
