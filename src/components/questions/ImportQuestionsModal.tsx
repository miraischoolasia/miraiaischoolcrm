import { useMemo, useState } from 'react'
import { DownloadSimple, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { buildImportTemplate, parseQuestionImport, questionKindLabels, type QuestionDraft } from '../../lib/questions'
import type { Subject } from '../../lib/subjects'
import { shortAgeGroup, useAgeGroups } from '../../lib/ageGroups'

// Many questions at once: paste rows from Excel / Google Sheets, or pick a CSV.
// Every row is checked first; nothing is saved while one is wrong.
export function ImportQuestionsModal({
  subjects,
  onClose,
  onImport,
}: {
  // Subjects are named in the file as the school wrote them.
  subjects: Subject[]
  onClose: () => void
  // Resolves to an error message, or null when saved.
  onImport: (drafts: QuestionDraft[], share: boolean) => Promise<string | null>
}) {
  const [text, setText] = useState('')
  const [share, setShare] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ageGroups = useAgeGroups()
  const rows = useMemo(() => (text.trim() ? parseQuestionImport(text, subjects, ageGroups) : []), [ageGroups, subjects, text])
  const bad = rows.filter((row) => row.error)
  const drafts = rows.flatMap((row) => (row.draft ? [row.draft] : []))

  function downloadTemplate() {
    const blob = new Blob([buildImportTemplate()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'questions-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    setText(await file.text())
  }

  async function save() {
    setSaving(true)
    const failure = await onImport(drafts, share)
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    onClose()
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div>
          <div className="text-sm font-medium text-[#be185d]">Question Bank</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Import questions</h2>
          <p className="mt-2 text-sm text-slate-500">
            Paste rows from Excel or Google Sheets (with the column names on top), or pick a CSV file. Options are split
            by | and a * marks a correct one. Subject: as named in Class Settings; ages: {ageGroups.map(shortAgeGroup).join(', ')} (split by |).
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

      <div data-modal-body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <DownloadSimple size={16} aria-hidden="true" />
            Template
          </button>
          <label className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Pick a CSV file
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              className="sr-only"
              onChange={(event) => void readFile(event.target.files?.[0])}
            />
          </label>
        </div>

        <textarea
          rows={6}
          value={text}
          aria-label="Questions to import"
          onChange={(event) => {
            setText(event.target.value)
            setError(null)
          }}
          placeholder={'type\tquestion\toptions\tanswers\tmatch\tpoints\tseconds\ttopic\nchoice\tWhat does a loop do?\t*Repeats steps | Stops\t\t\t10\t30\tLoops'}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
        />

        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-900">
              {drafts.length} ready{bad.length > 0 ? ` · ${bad.length} to fix` : ''}
            </div>
            <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-sm">
              {rows.map((row) => (
                <li key={row.row} className="flex gap-3 px-3 py-2">
                  <span className="w-12 shrink-0 text-slate-400">Row {row.row}</span>
                  {row.draft ? (
                    <span className="min-w-0 text-slate-700">
                      <span className="font-semibold">{questionKindLabels[row.draft.kind]}</span> · {row.draft.prompt}
                    </span>
                  ) : (
                    <span className="text-red-700">{row.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={share} onChange={(event) => setShare(event.target.checked)} className="h-4 w-4 accent-[#fc0c97]" />
          Share them with every teacher in the school
        </label>

        {error && (
          <div role="alert" className="text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={drafts.length === 0 || bad.length > 0 || saving}
            onClick={() => void save()}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            {saving ? 'Importing…' : `Import ${drafts.length} ${drafts.length === 1 ? 'question' : 'questions'}`}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
