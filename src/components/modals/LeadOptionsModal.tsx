import { useState } from 'react'
import { Eye, EyeSlash, Plus, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import type { LeadOption, LeadOptionKind } from '../../types/domain'

type LeadOptionsModalProps = {
  options: LeadOption[]
  error: string | null
  onClose: () => void
  onAdd: (kind: LeadOptionKind, label: string) => Promise<LeadOption | null>
  onRename: (option: LeadOption, label: string) => Promise<boolean>
  onSetActive: (option: LeadOption, isActive: boolean) => void
}

const sections: { kind: LeadOptionKind; title: string; hint: string }[] = [
  { kind: 'source', title: 'Sources', hint: 'Where a lead heard about us.' },
  { kind: 'pic', title: 'PIC', hint: 'The person in charge of following up.' },
]

// Rename or hide the lead Source / PIC names. Renaming changes every lead
// that uses the name; hiding only removes it from the pickers.
export function LeadOptionsModal({
  options,
  error,
  onClose,
  onAdd,
  onRename,
  onSetActive,
}: LeadOptionsModalProps) {
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Leads settings</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Sources &amp; PIC</h2>
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
        {sections.map((section) => (
          <OptionList
            key={section.kind}
            title={section.title}
            hint={section.hint}
            options={options.filter((option) => option.kind === section.kind)}
            onAdd={(label) => onAdd(section.kind, label)}
            onRename={onRename}
            onSetActive={onSetActive}
          />
        ))}
      </div>
    </ModalShell>
  )
}

function OptionList({
  title,
  hint,
  options,
  onAdd,
  onRename,
  onSetActive,
}: {
  title: string
  hint: string
  options: LeadOption[]
  onAdd: (label: string) => Promise<LeadOption | null>
  onRename: (option: LeadOption, label: string) => Promise<boolean>
  onSetActive: (option: LeadOption, isActive: boolean) => void
}) {
  const [newLabel, setNewLabel] = useState('')

  async function add() {
    if (newLabel.trim() && (await onAdd(newLabel.trim()))) {
      setNewLabel('')
    }
  }

  return (
    <section className="space-y-3" aria-label={title}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <ul className="space-y-2">
        {options.map((option) => (
          <OptionRow
            key={`${option.id}-${option.label}`}
            option={option}
            onRename={onRename}
            onSetActive={onSetActive}
          />
        ))}
        {options.length === 0 && <li className="text-sm text-slate-400">None yet.</li>}
      </ul>
      <div className="flex gap-2">
        <input
          type="text"
          value={newLabel}
          maxLength={60}
          placeholder={`Add ${title === 'PIC' ? 'a PIC' : 'a source'}`}
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
    </section>
  )
}

function OptionRow({
  option,
  onRename,
  onSetActive,
}: {
  option: LeadOption
  onRename: (option: LeadOption, label: string) => Promise<boolean>
  onSetActive: (option: LeadOption, isActive: boolean) => void
}) {
  const [draft, setDraft] = useState(option.label)

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
    </li>
  )
}
