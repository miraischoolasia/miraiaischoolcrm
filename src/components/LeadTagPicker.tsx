import { useState } from 'react'
import { LeadTagChip } from './LeadTagChip'
import { TAG_COLORS, nextTagColor } from '../lib/leadTags'
import { cn } from '../lib/cn'
import type { LeadOption } from '../types/domain'

const ADD_NEW = '__add_new__'

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

type LeadTagPickerProps = {
  // Every tag, hidden ones too: a hidden tag already on the lead still shows.
  tags: LeadOption[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  // Saves a new tag and returns it, or null when it could not be added.
  onCreate: (label: string, color: string) => Promise<LeadOption | null>
}

// The lead's tags as pills, a list to add one that exists, and a way to make a
// new one on the spot (name and colour) that is picked right away.
export function LeadTagPicker({ tags, selectedIds, onChange, onCreate }: LeadTagPickerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(() => nextTagColor(tags))
  const [isSaving, setIsSaving] = useState(false)

  const selected = selectedIds.flatMap((id) => tags.find((tag) => tag.id === id) ?? [])
  const available = tags.filter((tag) => tag.isActive && !selectedIds.includes(tag.id))

  async function create() {
    const trimmed = name.trim()
    if (!trimmed || isSaving) {
      return
    }
    setIsSaving(true)
    const created = await onCreate(trimmed, color)
    setIsSaving(false)
    if (created) {
      onChange([...selectedIds, created.id])
      setName('')
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-700">Tags</div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <LeadTagChip
              key={tag.id}
              tag={tag}
              onRemove={() => onChange(selectedIds.filter((id) => id !== tag.id))}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No tags yet.</p>
      )}

      {isCreating ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={name}
              maxLength={60}
              aria-label="New tag name"
              placeholder="New tag name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // Enter adds the tag instead of saving the whole lead.
                  event.preventDefault()
                  void create()
                } else if (event.key === 'Escape') {
                  event.stopPropagation()
                  setIsCreating(false)
                }
              }}
              className={inputClass}
            />
            <button
              type="button"
              disabled={isSaving || !name.trim()}
              onClick={() => void create()}
              className="shrink-0 rounded-lg bg-[#fc0c97] px-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="shrink-0 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
          <div role="radiogroup" aria-label="Tag colour" className="flex flex-wrap gap-2">
            {TAG_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={color === swatch}
                aria-label={swatch}
                onClick={() => setColor(swatch)}
                className={cn(
                  'h-6 w-6 rounded-full border-2 transition',
                  color === swatch ? 'border-slate-800' : 'border-white ring-1 ring-slate-200',
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        </div>
      ) : (
        <select
          aria-label="Add a tag"
          value=""
          onChange={(event) => {
            const value = event.target.value
            if (value === ADD_NEW) {
              setName('')
              setColor(nextTagColor(tags))
              setIsCreating(true)
            } else if (value) {
              onChange([...selectedIds, Number(value)])
            }
          }}
          className={inputClass}
        >
          <option value="">Add a tag...</option>
          {available.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.label}
            </option>
          ))}
          <option value={ADD_NEW}>+ Create new tag...</option>
        </select>
      )}
    </div>
  )
}
