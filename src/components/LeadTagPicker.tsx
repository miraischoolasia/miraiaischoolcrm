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
  // Off where the page already puts a "Tags" heading above the picker.
  showLabel?: boolean
  // The Inbox's small tag pills.
  compact?: boolean
  // The student profile's header: the pills on a line with a small "+" that opens a short list (search, pick, or make a
  // new tag), instead of a big drop-down.
  inline?: boolean
}

// The lead's tags as pills, a list to add one that exists, and a way to make a
// new one on the spot (name and colour) that is picked right away.
export function LeadTagPicker({ tags, selectedIds, onChange, onCreate, showLabel = true, compact = false, inline = false }: LeadTagPickerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(() => nextTagColor(tags))
  const [isSaving, setIsSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')

  // In the school's tag order (Sources, PIC & Tags), not the order they were put on.
  const selected = tags.filter((tag) => selectedIds.includes(tag.id))
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

  if (inline) {
    const needle = search.trim().toLowerCase()
    const matches = available.filter((tag) => !needle || tag.label.toLowerCase().includes(needle))
    return (
      <div className="relative flex flex-wrap items-center gap-1.5">
        {selected.map((tag) => (
          <LeadTagChip key={tag.id} tag={tag} onRemove={() => onChange(selectedIds.filter((id) => id !== tag.id))} />
        ))}
        <button
          type="button"
          aria-label="Add a tag"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((current) => !current)
            setIsCreating(false)
            setSearch('')
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 text-base leading-none text-slate-500 transition hover:bg-slate-50"
        >
          +
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-9 z-30 w-64 space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {isCreating ? (
              <>
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
                      event.preventDefault()
                      void create().then(() => setMenuOpen(false))
                    } else if (event.key === 'Escape') {
                      event.stopPropagation()
                      setIsCreating(false)
                    }
                  }}
                  className={inputClass}
                />
                <div role="radiogroup" aria-label="Tag colour" className="grid grid-cols-9 gap-1">
                  {TAG_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      role="radio"
                      aria-checked={color === swatch}
                      aria-label={swatch}
                      onClick={() => setColor(swatch)}
                      className={cn(
                        'aspect-square w-full max-w-6 justify-self-center rounded-full border-2 transition min-h-0!',
                        color === swatch ? 'border-slate-800' : 'border-white ring-1 ring-slate-200',
                      )}
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsCreating(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || !name.trim()}
                    onClick={() => void create().then(() => setMenuOpen(false))}
                    className="rounded-lg bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
                  >
                    {isSaving ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  type="search"
                  autoFocus
                  value={search}
                  aria-label="Search tags"
                  placeholder="Search tags"
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation()
                      setMenuOpen(false)
                    }
                  }}
                  className={inputClass}
                />
                <ul className="max-h-48 overflow-y-auto">
                  {matches.map((tag) => (
                    <li key={tag.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange([...selectedIds, tag.id])
                          setMenuOpen(false)
                        }}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-50"
                      >
                        {tag.label}
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && <li className="px-2 py-1.5 text-sm text-slate-500">No tag matches.</li>}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setName(search.trim())
                    setColor(nextTagColor(tags))
                    setIsCreating(true)
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-[#be185d] hover:bg-slate-50"
                >
                  + Create new tag...
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {showLabel && <div className="text-sm font-semibold text-slate-700">Tags</div>}

      {selected.length > 0 ? (
        <div className={cn('flex flex-wrap', compact ? 'gap-1' : 'gap-1.5')}>
          {selected.map((tag) => (
            <LeadTagChip
              key={tag.id}
              tag={tag}
              compact={compact}
              onRemove={() => onChange(selectedIds.filter((id) => id !== tag.id))}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No tags yet.</p>
      )}

      {isCreating ? (
        // The name has a row of its own (the side panel of the Inbox is narrow), the colours go under it,
        // and Add / Cancel sit at the bottom right. Enter adds, Escape cancels.
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
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
          {/* Nine equal columns: the colours stay on one line however narrow the panel (each up to 24px). */}
          <div role="radiogroup" aria-label="Tag colour" className="grid grid-cols-9 gap-1">
            {TAG_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={color === swatch}
                aria-label={swatch}
                onClick={() => setColor(swatch)}
                className={cn(
                  // min-h-0: phones make every button 40px tall, which turned the circles into ovals.
                  'aspect-square w-full max-w-6 justify-self-center rounded-full border-2 transition min-h-0!',
                  color === swatch ? 'border-slate-800' : 'border-white ring-1 ring-slate-200',
                )}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || !name.trim()}
              onClick={() => void create()}
              className="rounded-lg bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add'}
            </button>
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
