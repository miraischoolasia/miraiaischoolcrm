import { useState } from 'react'
import { Eye, EyeSlash, Plus, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import type { Package, PackageKind } from '../../types/domain'

export type PackageDraft = Pick<
  Package,
  'name' | 'kind' | 'classCount' | 'durationMonths' | 'includesFees'
>

type PackagesModalProps = {
  packages: Package[]
  onClose: () => void
  onAdd: (draft: PackageDraft) => Promise<boolean>
  onSave: (pkg: Package, draft: PackageDraft) => Promise<boolean>
  onSetActive: (pkg: Package, isActive: boolean) => void
}

export const packageKindLabels: Record<PackageKind, string> = {
  trial: 'Trial',
  regular: 'Regular',
  camp: 'Camp',
}

const emptyDraft: PackageDraft = {
  name: '',
  kind: 'regular',
  classCount: 4,
  durationMonths: 1,
  includesFees: true,
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

// Add, change and hide course packages. Hidden packages stay on the students
// and enrollments that use them but are not offered for new sign-ups.
export function PackagesModal({ packages, onClose, onAdd, onSave, onSetActive }: PackagesModalProps) {
  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Students settings</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Packages</h2>
            <p className="mt-2 text-sm text-slate-500">
              Picking a package on sign-up or renewal fills in the classes and expiry dates.
              Packages with fees also set the yearly Account Fee and Mirai Club dates.
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

      <div data-modal-body className="max-h-[70vh] space-y-3 overflow-y-auto px-6 py-6 sm:px-8">
        <div className="hidden grid-cols-[1fr_7rem_5rem_5rem_4rem_5.5rem] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Name</span>
          <span>Type</span>
          <span>Classes</span>
          <span>Months</span>
          <span>Fees</span>
          <span />
        </div>
        <ul className="space-y-2">
          {packages.map((pkg) => (
            <PackageRow
              key={`${pkg.id}-${pkg.name}-${pkg.kind}-${pkg.classCount}-${pkg.durationMonths}-${pkg.includesFees}`}
              pkg={pkg}
              onSave={onSave}
              onSetActive={onSetActive}
            />
          ))}
        </ul>
        <NewPackageRow onAdd={onAdd} />
      </div>
    </ModalShell>
  )
}

function DraftFields({
  draft,
  onChange,
  label,
  muted = false,
}: {
  draft: PackageDraft
  onChange: (next: PackageDraft) => void
  label: string
  muted?: boolean
}) {
  return (
    <>
      <input
        type="text"
        value={draft.name}
        maxLength={60}
        placeholder="Package name"
        aria-label={`${label} name`}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        className={cn(inputClass, muted && 'bg-slate-50 text-slate-400')}
      />
      <select
        value={draft.kind}
        aria-label={`${label} type`}
        onChange={(event) => {
          const kind = event.target.value as PackageKind
          // Only regular packages carry the yearly fees by default.
          onChange({ ...draft, kind, includesFees: kind === 'regular' })
        }}
        className={inputClass}
      >
        {(Object.keys(packageKindLabels) as PackageKind[]).map((kind) => (
          <option key={kind} value={kind}>
            {packageKindLabels[kind]}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        max={500}
        value={draft.classCount}
        aria-label={`${label} classes`}
        onChange={(event) => onChange({ ...draft, classCount: Number(event.target.value) })}
        className={inputClass}
      />
      <input
        type="number"
        min={1}
        max={36}
        value={draft.durationMonths}
        aria-label={`${label} months`}
        onChange={(event) => onChange({ ...draft, durationMonths: Number(event.target.value) })}
        className={inputClass}
      />
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <input
          type="checkbox"
          checked={draft.includesFees}
          aria-label={`${label} includes fees`}
          onChange={(event) => onChange({ ...draft, includesFees: event.target.checked })}
          className="h-4 w-4 accent-[#fc0c97]"
        />
        <span className="sm:hidden">Account Fee &amp; Mirai Club</span>
      </label>
    </>
  )
}

function isValid(draft: PackageDraft) {
  return (
    draft.name.trim().length > 0 &&
    Number.isInteger(draft.classCount) &&
    draft.classCount >= 1 &&
    draft.classCount <= 500 &&
    Number.isInteger(draft.durationMonths) &&
    draft.durationMonths >= 1 &&
    draft.durationMonths <= 36
  )
}

function PackageRow({
  pkg,
  onSave,
  onSetActive,
}: {
  pkg: Package
  onSave: (pkg: Package, draft: PackageDraft) => Promise<boolean>
  onSetActive: (pkg: Package, isActive: boolean) => void
}) {
  const initial: PackageDraft = {
    name: pkg.name,
    kind: pkg.kind,
    classCount: pkg.classCount,
    durationMonths: pkg.durationMonths,
    includesFees: pkg.includesFees,
  }
  const [draft, setDraft] = useState(initial)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial)

  return (
    <li className="grid grid-cols-2 items-center gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_7rem_5rem_5rem_4rem_5.5rem] sm:border-0 sm:p-0">
      <DraftFields draft={draft} onChange={setDraft} label={pkg.name} muted={!pkg.isActive} />
      <div className="flex items-center justify-end gap-1.5">
        {isDirty && (
          <button
            type="button"
            disabled={!isValid(draft)}
            onClick={() => void onSave(pkg, { ...draft, name: draft.name.trim() })}
            className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            Save
          </button>
        )}
        <button
          type="button"
          onClick={() => onSetActive(pkg, !pkg.isActive)}
          aria-label={pkg.isActive ? `Hide ${pkg.name}` : `Show ${pkg.name}`}
          title={pkg.isActive ? 'Hide' : 'Show'}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
        >
          {pkg.isActive ? (
            <Eye size={16} aria-hidden="true" />
          ) : (
            <EyeSlash size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </li>
  )
}

function NewPackageRow({ onAdd }: { onAdd: (draft: PackageDraft) => Promise<boolean> }) {
  const [draft, setDraft] = useState(emptyDraft)

  async function add() {
    if (await onAdd({ ...draft, name: draft.name.trim() })) {
      setDraft(emptyDraft)
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <div className="text-sm font-semibold text-slate-700">Add a package</div>
      <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_7rem_5rem_5rem_4rem_5.5rem]">
        <DraftFields draft={draft} onChange={setDraft} label="New package" />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!isValid(draft)}
            onClick={() => void add()}
            aria-label="Add package"
            className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
