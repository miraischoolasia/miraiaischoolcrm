import { useState } from 'react'
import { PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { LeadTagChip } from '../LeadTagChip'
import { LeadTagPicker } from '../LeadTagPicker'
import { useConfirm } from '../../hooks/useConfirm'
import type { SourceRule } from '../../lib/sourceRules'
import type { SourceRuleDraft } from '../../lib/sourceRulesApi'
import type { LeadOption, LeadOptionKind } from '../../types/domain'

type SourceRuleManagerProps = {
  rules: SourceRule[]
  isLoading: boolean
  loadError: string | null
  leadOptions: LeadOption[]
  // Opens straight on a new rule with this phrase filled in (the parent's first message).
  initialPhrase?: string
  onClose: () => void
  // Each returns an error message, or null when it worked.
  onSave: (existing: SourceRule | null, draft: SourceRuleDraft) => Promise<string | null>
  onRemove: (rule: SourceRule) => Promise<string | null>
  onAddOption: (kind: LeadOptionKind, label: string, color?: string) => Promise<LeadOption | null>
}

const fieldClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'

function RuleForm({
  existing,
  initialPhrase,
  leadOptions,
  onCancel,
  onSave,
  onAddOption,
}: {
  existing: SourceRule | null
  initialPhrase: string
  leadOptions: LeadOption[]
  onCancel: () => void
  onSave: SourceRuleManagerProps['onSave']
  onAddOption: SourceRuleManagerProps['onAddOption']
}) {
  const sources = leadOptions.filter((option) => option.kind === 'source' && option.isActive)
  const tags = leadOptions.filter((option) => option.kind === 'tag')
  const [phrase, setPhrase] = useState(existing?.phrase ?? initialPhrase)
  const [sourceId, setSourceId] = useState(existing?.sourceId ? String(existing.sourceId) : '')
  const [tagIds, setTagIds] = useState<number[]>(existing?.tagIds ?? [])
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function save() {
    if (!phrase.trim()) {
      setError('Write the words the parent sends.')
      return
    }
    if (!sourceId && tagIds.length === 0) {
      setError('Choose a source, a tag, or both. Otherwise the rule does nothing.')
      return
    }
    setIsSaving(true)
    setError(null)
    const problem = await onSave(existing, {
      phrase,
      sourceId: sourceId ? Number(sourceId) : null,
      tagIds,
      isActive,
    })
    setIsSaving(false)
    if (problem) {
      setError(problem)
      return
    }
    onCancel()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-modal-body className="max-h-[70vh] min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">When the first message contains</span>
          <textarea
            value={phrase}
            rows={3}
            maxLength={300}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder="e.g. I want to know more about the HOA course"
            className={fieldClass}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Capitals, spacing and punctuation do not matter. Use the line an advert fills in for the parent, or a few words from it.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Set the source to</span>
          <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className={fieldClass}>
            <option value="">Do not set a source</option>
            {sources.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <LeadTagPicker
          tags={tags}
          selectedIds={tagIds}
          onChange={setTagIds}
          onCreate={(label, color) => onAddOption('tag', label, color)}
        />

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Use this rule
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3 sm:px-8">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save rule'}
        </button>
      </div>
    </div>
  )
}

// Where the team decides which first messages mean which source and tags.
export function SourceRuleManager({
  rules,
  isLoading,
  loadError,
  leadOptions,
  initialPhrase = '',
  onClose,
  onSave,
  onRemove,
  onAddOption,
}: SourceRuleManagerProps) {
  const [editing, setEditing] = useState<SourceRule | 'new' | null>(initialPhrase ? 'new' : null)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const label = (id: number | null) => leadOptions.find((option) => option.id === id)?.label

  async function remove(rule: SourceRule) {
    const sure = await confirm(`Delete the rule for "${rule.phrase}"?`, { confirmLabel: 'Delete' })
    if (!sure) {
      return
    }
    setError(await onRemove(rule))
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">WhatsApp</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {editing === null ? 'Source rules' : editing === 'new' ? 'New source rule' : 'Edit source rule'}
            </h2>
            {editing === null && (
              <p className="mt-2 text-sm text-slate-500">
                When a parent's first message contains the words you set, the source and tags are chosen for you on the new lead form.
                You still press Save lead.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {editing !== null ? (
        <RuleForm
          existing={editing === 'new' ? null : editing}
          initialPhrase={initialPhrase}
          leadOptions={leadOptions}
          onCancel={() => setEditing(null)}
          onSave={onSave}
          onAddOption={onAddOption}
        />
      ) : (
        <div data-modal-body className="max-h-[70vh] min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-6 sm:px-8">
          {(error || loadError) && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error ?? loadError}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null)
              setEditing('new')
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
          >
            <Plus size={14} aria-hidden="true" />
            New rule
          </button>
          {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
          {!isLoading && !loadError && rules.length === 0 && (
            <p className="text-sm text-slate-500">No rules yet. Add the opening line of each advert.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="line-clamp-2 break-words">"{rule.phrase}"</span>
                    {!rule.isActive && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Off</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Source: {label(rule.sourceId) ?? 'not set'}
                  </p>
                  {rule.tagIds.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {rule.tagIds.flatMap((id) => leadOptions.find((option) => option.id === id) ?? []).map((tag) => (
                        <LeadTagChip key={tag.id} tag={tag} />
                      ))}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null)
                    setEditing(rule)
                  }}
                  aria-label={`Edit rule ${rule.phrase}`}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                >
                  <PencilSimple size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(rule)}
                  aria-label={`Delete rule ${rule.phrase}`}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dialog}
    </ModalShell>
  )
}
