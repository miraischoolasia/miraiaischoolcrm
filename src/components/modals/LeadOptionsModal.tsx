import { useState, type DragEvent } from 'react'
import { ArrowDown, ArrowUp, DotsSixVertical, Eye, EyeSlash, Plus, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { DEFAULT_TAG_COLOR, isTagColor, moveLeadOption, nextTagColor } from '../../lib/leadTags'
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
  // Saves the school's order of one kind of name: its ids, shown ones in the order wanted, then the hidden ones.
  onReorder?: (ids: number[]) => void
}

type Section = {
  kind: LeadOptionKind
  title: string
  hint: string
  // Tags have a colour of their own.
  colorful?: boolean
  // The tick columns are always three: they can be renamed, not added or hidden.
  fixed?: boolean
  // PIC names are made from the staff list (20261101300000): shown here, changed in My Team.
  fromStaff?: boolean
  singular: string
}

const sections: Section[] = [
  { kind: 'source', title: 'Sources', hint: 'Where a lead heard about us.', singular: 'a source' },
  {
    kind: 'pic',
    title: 'PIC',
    hint: 'Made from the staff list: every staff member has one. Link an old name to a staff member in My Team › Teams › PIC names.',
    fromStaff: true,
    singular: 'a PIC',
  },
  {
    kind: 'tag',
    title: 'Tags',
    hint: 'Labels to put on a lead, each with a colour.',
    colorful: true,
    singular: 'a tag',
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
  onReorder,
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
          .map((section) =>
            section.fromStaff ? (
              <StaffPicList
                key={section.kind}
                title={section.title}
                hint={section.hint}
                options={options.filter((option) => option.kind === section.kind && option.isActive)}
              />
            ) : (
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
              onReorder={section.fixed ? undefined : onReorder}
            />
            ),
          )}
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
  onReorder,
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
  onReorder?: (ids: number[]) => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)
  // Shown names in the school's order (drag them, or the arrows on a phone); hidden ones after, greyed.
  const shown = options.filter((option) => option.isActive)
  const hidden = options.filter((option) => !option.isActive)
  const move = (movedId: number, targetId: number) => {
    const ids = moveLeadOption(shown.map((option) => option.id), movedId, targetId)
    if (onReorder && ids.some((id, index) => id !== shown[index].id)) {
      onReorder([...ids, ...hidden.map((option) => option.id)])
    }
  }
  const row = (option: LeadOption, index: number, list: LeadOption[]) => (
    <OptionRow
      key={`${option.id}-${option.label}`}
      option={option}
      colorful={colorful}
      fixed={fixed}
      onRename={onRename}
      onSetActive={onSetActive}
      onSetColor={onSetColor}
      order={
        onReorder && option.isActive && list.length > 1
          ? {
              dragging: dragId === option.id,
              onDragStart: () => setDragId(option.id),
              onDragEnd: () => setDragId(null),
              onDragOver: (event) => {
                if (dragId !== null) event.preventDefault()
              },
              onDrop: () => {
                if (dragId !== null) move(dragId, option.id)
                setDragId(null)
              },
              onUp: index > 0 ? () => move(option.id, list[index - 1].id) : undefined,
              onDown: index < list.length - 1 ? () => move(option.id, list[index + 1].id) : undefined,
            }
          : undefined
      }
    />
  )
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
        {(onReorder ? shown : options).map((option, index, list) => row(option, index, list))}
        {options.length === 0 && <li className="text-sm text-slate-400">None yet.</li>}
      </ul>
      {onReorder && hidden.length > 0 && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-2" aria-label={`Hidden ${title}`}>
          <p className="px-1 text-xs font-medium text-slate-400">Hidden</p>
          <ul className="space-y-2">{hidden.map((option, index, list) => row(option, index, list))}</ul>
        </div>
      )}
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

// The PIC names, read only: each one is a staff member's (or an old name not linked to anyone yet).
function StaffPicList({ title, hint, options }: { title: string; hint: string; options: LeadOption[] }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <ul className="space-y-2">
        {options.map((option) => (
          <li key={option.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <span className="truncate">{option.label}</span>
            {option.teacherId == null && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Not linked</span>
            )}
          </li>
        ))}
        {options.length === 0 && <li className="text-sm text-slate-400">None yet.</li>}
      </ul>
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
  order,
}: {
  option: LeadOption
  colorful?: boolean
  fixed?: boolean
  onRename: (option: LeadOption, label: string) => Promise<boolean>
  onSetActive: (option: LeadOption, isActive: boolean) => void
  onSetColor?: (option: LeadOption, color: string) => void
  // Moving the name: dragged by its handle (onto another name), or one step with the arrows.
  order?: {
    dragging: boolean
    onDragStart: () => void
    onDragEnd: () => void
    onDragOver: (event: DragEvent<HTMLLIElement>) => void
    onDrop: () => void
    onUp?: () => void
    onDown?: () => void
  }
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
    <li
      className={cn('flex items-center gap-2', order?.dragging && 'opacity-50')}
      onDragOver={order?.onDragOver}
      onDrop={order?.onDrop}
    >
      {order && (
        <span
          draggable
          onDragStart={order.onDragStart}
          onDragEnd={order.onDragEnd}
          title="Drag to move"
          aria-hidden="true"
          className="hidden shrink-0 cursor-grab text-slate-400 sm:block"
        >
          <DotsSixVertical size={16} />
        </span>
      )}
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
      {order && (
        <span className="flex shrink-0 flex-col">
          <button
            type="button"
            disabled={!order.onUp}
            onClick={order.onUp}
            aria-label={`Move ${option.label} up`}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            <ArrowUp size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!order.onDown}
            onClick={order.onDown}
            aria-label={`Move ${option.label} down`}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            <ArrowDown size={12} aria-hidden="true" />
          </button>
        </span>
      )}
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
