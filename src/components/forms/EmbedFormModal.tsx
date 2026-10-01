import { useState } from 'react'
import { Check, Copy, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { buildEmbedCode, buildFormUrl } from '../../lib/forms'

type EmbedFormModalProps = {
  formId: string
  formName: string
  isPublished: boolean
  onClose: () => void
}

function CopyBox({ label, value, rows }: { label: string; value: string; rows: number }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied('yes')
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied('failed')
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-slate-800">{label}</label>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {copied === 'yes' ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          {copied === 'yes' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        readOnly
        rows={rows}
        value={value}
        onFocus={(event) => event.target.select()}
        aria-label={label}
        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 focus:border-[#fc0c97] focus:outline-none"
      />
      {copied === 'failed' && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          Copy did not work here. Click the box and press Ctrl+C.
        </p>
      )}
    </div>
  )
}

export function EmbedFormModal({ formId, formName, isPublished, onClose }: EmbedFormModalProps) {
  const url = buildFormUrl(window.location.origin, formId)
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Share form</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{formName}</h2>
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

      <div data-modal-body className="space-y-5 px-6 py-6 sm:px-8">
        {!isPublished && (
          <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This form is not published, so visitors will see "not available" until you publish it.
          </p>
        )}
        {isLocal && (
          <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You are on {window.location.host}, so these only work on this computer. Open the
            live CRM address to copy the real ones.
          </p>
        )}
        <CopyBox label="Link" value={url} rows={2} />
        <CopyBox label="Embed code (paste into your website)" value={buildEmbedCode(url, formId, formName)} rows={5} />
        <p className="text-xs text-slate-500">
          The embedded form grows to fit its questions. Each submission appears under
          Submissions, and in Leads when the form creates leads.
        </p>
      </div>
    </ModalShell>
  )
}
