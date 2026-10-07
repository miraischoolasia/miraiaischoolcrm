import { useState } from 'react'
import { Eye, EyeSlash, Plus, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { DEFAULT_TAG_COLOR, isTagColor, nextTagColor } from '../../lib/leadTags'
import type { LeadOption, LeadOptionKind } from '../../types/domain'

type LeadOptionsModalProps = {
  options: LeadOption[]
  error: string | null
  onClose: () => void
  onAdd: (kind: LeadOptionKind, label: string, color?: string) => Promise<LeadOption | null>
  onRename: (option: LeadOption, label: string) => Promise<boolean>
  onSetActive: (option: LeadOption, isActive: boolean) => void
  // Changes a tag's colour.
  onSetColor?: (option: LeadOption, color: string) => void
}

type Section = {
  kind: LeadOptionKind
  title: string
  hint: string
  // Tags have a colour of their own.
  colorful?: boolean
  // The tick columns are always three: they can be renamed, not added or hidden.
  fixed?: boolean
  singular: string
}

const sections: Section[] = [
  { kind: 'source', title: 'Sources', hint: 'Where a lead heard about us.', singular: 'a source' },
  { kind: 'pic', title: 'PIC', hint: 'The person in charge of following up.', singular: 'a PIC' },
  {
    kind: 'tag',
    title: 'Tags',
    hint: 'Labels to put on a lead, each with a colour.',
    colorful: true,
    singular: 'a tag',
  },
  {
    kind: 'check',
    title: 'Tick columns',
    hint: 'The three columns of boxes in the Leads list, to see how far each lead was followed up.',
    fixed: true,
    singular: 'a column',
  },
]

// Rename or hide the lead Source / PIC / Tag names and rename the tick
// columns. Renaming changes every lead that uses the name; hiding only removes
// it from the pickers.
export function LeadOptionsModal({
  options,
  error,
  onClose,
  onAdd,
  onRename,
  onSetActive,
  onSetColor,
}: LeadOptionsModalProps) {
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Leads settings</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              Sources, PIC &amp; Tags
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Renaming updates every lead that uses the name. Hidden names stay on
              existing leads and reports but are not offered for new ones.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div data-modal-body className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-8">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        {sections
          // Without the database update there are no tick columns to rename.
          .filter(
            (section) =>
              !section.fixed || options.some((option) => option.kind === section.kind),
          )
          .map((section) => (
            <OptionList
              key={section.kind}
              title={section.title}
              hint={section.hint}
              singular={section.singular}
              colorful={section.colorful}
              fixed={section.fixed}
              options={options.filter((option) => option.kind === section.kind)}
              onAdd={(label, color) =>
                color ? onAdd(section.kind, label, color) : onAdd(section.kind, label)
              }
              onRename={onRename}
              onSetActive={onSetActive}
              onSetColor={onSetColor}
            />
          ))}
      </div>
    </ModalShell>
  )
}

function OptionList({
  title,
  hint,
  singular,
  colorful,
  fixed,
  options,
  onAdd,
  onRename,
  onSetActive,
  onSetColor,
}: {
  title: string
  hint: string
  singular: string
  colorful?: boolean
  fixed?: boolean
  options: LeadOption[]
  onAdd: (label: string, color?: string) => Promise<LeadOption | null>
  onRename: (option: LeadOption, label: string) => Promise<boolean>
  onSetActive: (option: LeadOption, isActive: boolean) => void
  onSetColor?: (option: LeadOption, color: string) => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState<string>(() => nextTagColor(options))

  async function add() {
    if (newLabel.trim() && (await onAdd(newLabel.trim(), colorful ? newColor : undefined))) {
      setNewLabel('')
      // The next new tag starts on a colour that is not in use yet.
      setNewColor(nextTagColor([...options, { ...options[0], color: newColor }]))
    }
  }

  return (
    <section className={cn('space-y-3', fixed && 'sm:col-span-2')} aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <ul className="space-y-2">
        {options.map((option) => (
          <OptionRow
            key={`${option.id}-${option.label}`}
            option={option}
            colorful={colorful}
            fixed={fixed}
            onRename={onRename}
            onSetActive={onSetActive}
            onSetColor={onSetColor}
          />
        ))}
        {options.length === 0 && <li className="text-sm text-slate-400">None yet.</li>}
      </ul>
      {!fixed && (
        <div className="flex gap-2">
          {colorful && (
            <input
              type="color"
              value={isTagColor(newColor) ? newColor : DEFAULT_TAG_COLOR}
              aria-label={`Colour of the new ${title} name`}
              onChange={(event) => setNewColor(event.target.value)}
              className="h-10 w-10 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
            />
          )}
          <input
            type="text"
            value={newLabel}
            maxLength={60}
            placeholder={`Add ${singular}`}
            aria-label={`New ${title} name`}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void add()
              }
            }}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]"
          />
          <button
            type="button"
            disabled={!newLabel.trim()}
            onClick={() => void add()}
            aria-label={`Add ${title}`}
            className="shrink-0 rounded-xl bg-[#fc0c97] px-3 text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  )
}

function OptionRow({
  option,
  colorful,
  fixed,
  onRename,
  onSetActive,
  onSetColor,
}: {
  option: LeadOption
  colorful?: boolean
  fixed?: boolean
  onRename: (option: LeadOption, label: string) => Promise<boolean>
  onSetActive: (option: LeadOption, isActive: boolean) => void
  onSetColor?: (option: LeadOption, color: string) => void
}) {
  const [draft, setDraft] = useState(option.label)
  const savedColor = option.color && isTagColor(option.color) ? option.color : DEFAULT_TAG_COLOR
  const [colorDraft, setColorDraft] = useState(savedColor)

  async function saveName() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === option.label) {
      setDraft(option.label)
      return
    }
    if (!(await onRename(option, trimmed))) {
      setDraft(option.label)
    }
  }

  return (
    <li className="flex items-center gap-2">
      {colorful && (
        <input
          type="color"
          value={colorDraft}
          aria-label={`Colour of ${option.label}`}
          onChange={(event) => setColorDraft(event.target.value)}
          // The picker fires all the time while it is dragged; save once it closes.
          onBlur={() => colorDraft !== savedColor && onSetColor?.(option, colorDraft)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
        />
      )}
      <input
        type="text"
        value={draft}
        maxLength={60}
        aria-label={`Rename ${option.label}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void saveName()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        className={cn(
          'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]',
          !option.isActive && 'bg-slate-50 text-slate-400',
        )}
      />
      {!fixed && (
        <button
          type="button"
          onClick={() => onSetActive(option, !option.isActive)}
          aria-label={option.isActive ? `Hide ${option.label}` : `Show ${option.label}`}
          title={option.isActive ? 'Hide' : 'Show'}
          className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
        >
          {option.isActive ? (
            <Eye size={16} aria-hidden="true" />
          ) : (
            <EyeSlash size={16} aria-hidden="true" />
          )}
        </button>
      )}
    </li>
  )
}
