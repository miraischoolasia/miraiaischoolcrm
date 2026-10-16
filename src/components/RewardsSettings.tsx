import { useState } from 'react'
import { Eye, EyeSlash, Plus, Trash } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { saveRewardPreset, setRewardLevels, type RewardLevel, type RewardPreset } from '../lib/rewards'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

// Class Settings > Rewards: the quick rewards teachers give in class, and the
// level names by points. Attendance points are set per status on the
// Attendance tab.
export function RewardsSettings({
  presets,
  levels,
  onChanged,
}: {
  presets: RewardPreset[]
  levels: RewardLevel[]
  // Reload presets and levels after a save.
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function run(action: Promise<string | null>) {
    const failure = await action
    setError(failure)
    if (!failure) onChanged()
    return failure === null
  }

  const sorted = [...presets].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Rewards teachers give in class</h3>
          <p className="text-sm text-slate-500">One click gives these points to everyone in class, or to the students picked.</p>
        </div>
        <ul className="space-y-2">
          {sorted.map((preset) => (
            <PresetRow
              key={`${preset.id}-${preset.label}-${preset.points}-${preset.emoji}-${preset.isActive}`}
              preset={preset}
              onSave={(changes) => run(saveRewardPreset(preset, changes))}
            />
          ))}
        </ul>
        <NewPresetRow onAdd={(draft) => run(saveRewardPreset(null, draft))} />
      </section>

      <LevelsEditor key={levels.map((level) => `${level.name}:${level.minPoints}`).join('|')} levels={levels} onSave={(next) => run(setRewardLevels(next))} />
    </div>
  )
}

type PresetDraft = Pick<RewardPreset, 'label' | 'points' | 'emoji'>

function presetValid(draft: PresetDraft) {
  return draft.label.trim().length > 0 && Number.isInteger(draft.points) && draft.points >= 1 && draft.points <= 100
}

function PresetFields({ draft, onChange, label }: { draft: PresetDraft; onChange: (next: PresetDraft) => void; label: string }) {
  return (
    <>
      <input
        type="text"
        value={draft.emoji ?? ''}
        maxLength={8}
        placeholder="🌟"
        aria-label={`${label} emoji`}
        onChange={(event) => onChange({ ...draft, emoji: event.target.value })}
        className={cn(inputClass, 'text-center')}
      />
      <input
        type="text"
        value={draft.label}
        maxLength={40}
        placeholder="e.g. Great answer"
        aria-label={`${label} name`}
        onChange={(event) => onChange({ ...draft, label: event.target.value })}
        className={inputClass}
      />
      <input
        type="number"
        min={1}
        max={100}
        value={draft.points}
        aria-label={`${label} points`}
        onChange={(event) => onChange({ ...draft, points: Number(event.target.value) })}
        className={inputClass}
      />
    </>
  )
}

const presetGrid = 'grid grid-cols-[3.5rem_1fr_5rem_5.5rem] items-center gap-2'

function PresetRow({ preset, onSave }: { preset: RewardPreset; onSave: (changes: Partial<RewardPreset>) => Promise<boolean> }) {
  const initial: PresetDraft = { label: preset.label, points: preset.points, emoji: preset.emoji ?? '' }
  const [draft, setDraft] = useState(initial)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  return (
    <li className={cn(presetGrid, !preset.isActive && 'opacity-60')}>
      <PresetFields draft={draft} onChange={setDraft} label={preset.label} />
      <div className="flex justify-end gap-1">
        {dirty && (
          <button
            type="button"
            disabled={!presetValid(draft)}
            onClick={() => void onSave({ ...draft, label: draft.label.trim() })}
            className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Save
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSave({ isActive: !preset.isActive })}
          aria-label={preset.isActive ? `Hide ${preset.label}` : `Show ${preset.label}`}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
        >
          {preset.isActive ? <Eye size={16} aria-hidden="true" /> : <EyeSlash size={16} aria-hidden="true" />}
        </button>
      </div>
    </li>
  )
}

function NewPresetRow({ onAdd }: { onAdd: (draft: PresetDraft) => Promise<boolean> }) {
  const empty: PresetDraft = { label: '', points: 3, emoji: '' }
  const [draft, setDraft] = useState(empty)

  return (
    <div className={cn(presetGrid, 'border-t border-slate-200 pt-3')}>
      <PresetFields draft={draft} onChange={setDraft} label="New reward" />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!presetValid(draft)}
          onClick={() => void onAdd({ ...draft, label: draft.label.trim() }).then((ok) => ok && setDraft(empty))}
          aria-label="Add reward"
          className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  )
}

function LevelsEditor({
  levels,
  onSave,
}: {
  levels: RewardLevel[]
  onSave: (levels: Array<Pick<RewardLevel, 'name' | 'minPoints'>>) => Promise<boolean>
}) {
  const initial = [...levels]
    .sort((left, right) => left.minPoints - right.minPoints)
    .map((level) => ({ name: level.name, minPoints: level.minPoints }))
  const [rows, setRows] = useState(initial)
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial)
  const mins = rows.map((row) => row.minPoints)
  const valid =
    rows.length > 0 &&
    rows.length <= 20 &&
    mins.includes(0) &&
    new Set(mins).size === mins.length &&
    rows.every((row) => row.name.trim() !== '' && Number.isInteger(row.minPoints) && row.minPoints >= 0)

  function change(index: number, next: Partial<(typeof rows)[number]>) {
    setRows(rows.map((row, at) => (at === index ? { ...row, ...next } : row)))
  }

  return (
    <section className="space-y-3 border-t border-slate-200 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Levels</h3>
        <p className="text-sm text-slate-500">A student reaches a level at its points. The first level starts at 0.</p>
      </div>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-2">
            <input
              type="text"
              value={row.name}
              maxLength={30}
              aria-label={`Level ${index + 1} name`}
              onChange={(event) => change(index, { name: event.target.value })}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              value={row.minPoints}
              aria-label={`Level ${index + 1} points`}
              onChange={(event) => change(index, { minPoints: Number(event.target.value) })}
              className={inputClass}
            />
            <button
              type="button"
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, at) => at !== index))}
              aria-label={`Remove level ${row.name || index + 1}`}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
            >
              <Trash size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={rows.length >= 20}
          onClick={() =>
            setRows([...rows, { name: '', minPoints: Math.max(0, ...rows.map((row) => row.minPoints)) + 100 }])
          }
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add a level
        </button>
        <button
          type="button"
          disabled={!dirty || !valid}
          title={!valid ? 'Each level needs a name and its own points, and one must start at 0.' : undefined}
          onClick={() =>
            void onSave(
              [...rows]
                .map((row) => ({ name: row.name.trim(), minPoints: row.minPoints }))
                .sort((left, right) => left.minPoints - right.minPoints),
            )
          }
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save levels
        </button>
      </div>
    </section>
  )
}
