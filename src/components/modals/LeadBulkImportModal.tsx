import { useRef, useState } from 'react'
import { DownloadSimple, UploadSimple, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { buildLeadCsvTemplate, parseLeadCsv, type BulkLeadRow } from '../../lib/leadCsv'

type LeadBulkImportModalProps = {
  todayString: string
  isImporting: boolean
  importError: string | null
  onClose: () => void
  onImport: (rows: BulkLeadRow[]) => void
}

export function LeadBulkImportModal({
  todayString,
  isImporting,
  importError,
  onClose,
  onImport,
}: LeadBulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsedRows, setParsedRows] = useState<BulkLeadRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [readError, setReadError] = useState<string | null>(null)

  function downloadTemplate() {
    const csv = buildLeadCsvTemplate()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'lead-bulk-import-example.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setFileName(file.name)
    setReadError(null)

    try {
      const text = await file.text()
      const { rows, errors } = parseLeadCsv(text, todayString)
      setParsedRows(rows)
      setParseErrors(errors)
    } catch {
      setParsedRows([])
      setParseErrors([])
      setReadError('Could not read that file. Please upload a CSV file.')
    } finally {
      event.target.value = ''
    }
  }

  function handleImportClick() {
    if (parsedRows.length === 0) {
      return
    }
    onImport(parsedRows)
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">Leads</div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Bulk Import Leads</h2>
            <p className="mt-2 text-sm text-slate-500">
              Upload a CSV file to add many leads at once.
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

      <div className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
        {importError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {importError}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-700">1. Get the template</div>
            <p className="text-xs text-slate-500">
              Download the example CSV, fill in your leads, then upload it below.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <DownloadSimple size={14} aria-hidden="true" />
            Download Example CSV
          </button>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <div className="text-sm font-semibold text-slate-700">2. Upload your file</div>
            <p className="text-xs text-slate-500">
              Only <span className="font-medium">Added Date</span> should be in YYYY-MM-DD
              format. Source and Stage accept the values shown in the template.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
            >
              <UploadSimple size={16} weight="bold" aria-hidden="true" />
              Choose CSV File
            </button>
            {fileName && <span className="text-sm text-slate-600">{fileName}</span>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {readError && <p className="text-sm text-red-600">{readError}</p>}

          {fileName && !readError && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-700">
                {parsedRows.length} lead{parsedRows.length === 1 ? '' : 's'} ready to import
              </p>
              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-800">
                    {parseErrors.length} row{parseErrors.length === 1 ? '' : 's'} skipped or need
                    fixing:
                  </p>
                  <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-xs text-amber-700">
                    {parseErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isImporting || parsedRows.length === 0}
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isImporting ? 'Importing...' : `Import ${parsedRows.length || ''} Lead${parsedRows.length === 1 ? '' : 's'}`.trim()}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
