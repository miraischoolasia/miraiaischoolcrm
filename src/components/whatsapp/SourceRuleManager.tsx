import { useState } from 'react'
import { Copy, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { LeadTagChip } from '../LeadTagChip'
import type { SourceRule } from '../../lib/sourceRules'
import type { LeadOption } from '../../types/domain'

type SourceRuleManagerProps = {
  rules: SourceRule[]
  isLoading: boolean
  loadError: string | null
  leadOptions: LeadOption[]
  // The parent's first message, shown so it can be copied into a new source keyword flow.
  initialPhrase?: string
  onClose: () => void
}

// Source keywords are automation flows now ("A first message has a source keyword" on the Automations page): this
// only shows what they are, and where to change them.
export function SourceRuleManager({ rules, isLoading, loadError, leadOptions, initialPhrase = '', onClose }: SourceRuleManagerProps) {
  const [copied, setCopied] = useState(false)
  const label = (id: number | null) => leadOptions.find((option) => option.id === id)?.label

  async function copy() {
    try {
      await navigator.clipboard.writeText(initialPhrase)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">WhatsApp</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Source keywords</h2>
            <p className="mt-2 text-sm text-slate-500">
              When a parent's first message holds a keyword, the chat becomes a lead with that source and those tags, at
              once. Each keyword is a flow on <span className="font-semibold text-slate-700">Marketing → Automations</span>{' '}
              (it starts from “A first message has a source keyword”): add, change or switch them off there.
            </p>
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

      <div data-modal-body className="max-h-[70vh] min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-6 sm:px-8">
        {initialPhrase.trim() !== '' && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <p className="font-semibold">This chat's first message</p>
            <p className="mt-1 line-clamp-3 break-words">"{initialPhrase}"</p>
            <p className="mt-1 text-xs text-sky-800">
              To make it a source keyword: copy it, then on Automations press New flow and pick “Make a lead from a
              first message with a keyword”.
            </p>
            <button
              type="button"
              onClick={() => void copy()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              <Copy size={14} aria-hidden="true" />
              {copied ? 'Copied' : 'Copy the message'}
            </button>
          </div>
        )}
        {loadError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </p>
        )}
        {isLoading && <p className="text-sm text-slate-500">Loading...</p>}
        {!isLoading && !loadError && rules.length === 0 && (
          <p className="text-sm text-slate-500">No source keywords yet.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {rules.map((rule) => (
            <li key={rule.id} className="py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="line-clamp-2 break-words">"{rule.phrase}"</span>
                {!rule.isActive && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Off</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-600">Source: {label(rule.sourceId) ?? 'Other'}</p>
              {rule.tagIds.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {rule.tagIds.flatMap((id) => leadOptions.find((option) => option.id === id) ?? []).map((tag) => (
                    <LeadTagChip key={tag.id} tag={tag} />
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  )
}
