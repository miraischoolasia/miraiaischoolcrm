import { useState } from 'react'
import type { LeadOption } from '../types/domain'

const ADD_NEW = '__add_new__'

const inputClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

type LeadOptionPickerProps = {
  label: string
  // Every option of this kind; hidden ones only show when already picked.
  options: LeadOption[]
  value: string
  // Text of the "nobody / nothing" choice; omit when a value is required.
  emptyLabel?: string
  onChange: (value: string) => void
  // Saves a new option and returns it, or null when it could not be added.
  onAdd: (label: string) => Promise<LeadOption | null>
}

// A dropdown whose last entry, "+ Add new...", turns into a text box: type
// the name, press Enter, and it is added and picked without leaving the form.
export function LeadOptionPicker({
  label,
  options,
  value,
  emptyLabel,
  onChange,
  onAdd,
}: LeadOptionPickerProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const visibleOptions = options.filter(
    (option) => option.isActive || String(option.id) === value,
  )

  async function addOption() {
    const trimmed = newLabel.trim()
    if (!trimmed) {
      return
    }

    setIsSaving(true)
    const added = await onAdd(trimmed)
    setIsSaving(false)

    if (added) {
      onChange(String(added.id))
      setNewLabel('')
      setIsAdding(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      {isAdding ? (
        <div className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={newLabel}
            maxLength={60}
            aria-label={`New ${label.toLowerCase()} name`}
            placeholder={`New ${label.toLowerCase()} name`}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                // Enter adds the name instead of submitting the lead form.
                event.preventDefault()
                void addOption()
              } else if (event.key === 'Escape') {
                event.stopPropagation()
                setIsAdding(false)
              }
            }}
            className={inputClassName}
          />
          <button
            type="button"
            disabled={isSaving || !newLabel.trim()}
            onClick={() => void addOption()}
            className="shrink-0 rounded-xl bg-[#fc0c97] px-4 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            {isSaving ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <select
          aria-label={label}
          value={value}
          onChange={(event) => {
            if (event.target.value === ADD_NEW) {
              setNewLabel('')
              setIsAdding(true)
            } else {
              onChange(event.target.value)
            }
          }}
          className={inputClassName}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {visibleOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.isActive ? '' : ' (hidden)'}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new...</option>
        </select>
      )}
    </div>
  )
}
