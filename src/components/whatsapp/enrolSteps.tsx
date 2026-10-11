import { useState } from 'react'
import { CheckCircle, FilePdf, Trash } from '@phosphor-icons/react'
import type { useLeadEnrolment } from '../../hooks/useLeadEnrolment'
import { formatDate } from '../../domain/studentStatus'
import { formatZoomTime } from '../../lib/enrolMessage'
import { prepareReceipt } from '../../lib/receiptPdf'

// The pieces the enrol panels (HOA and Holiday Camp) have in common.

export const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-[#fc0c97] disabled:bg-slate-50'
export const buttonClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

export function Step({ number, done, title, children }: { number: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h5 className="flex items-center gap-2 font-semibold text-slate-800">
        {done ? (
          <CheckCircle size={18} weight="fill" className="text-emerald-600" aria-label="Done" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-500"
          >
            {number}
          </span>
        )}
        {title}
      </h5>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  )
}

export function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="text-red-600">
      {text}
    </p>
  ) : null
}

type Enrolment = ReturnType<typeof useLeadEnrolment>

// The payment receipt: kept with the lead as one PDF (a photo is turned into a PDF here).
export function ReceiptStep({ number, enrolment, canEdit }: { number: number; enrolment: Enrolment; canEdit: boolean }) {
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function choose(file: File | undefined) {
    if (!file) {
      return
    }
    setUploading(true)
    setProblem(null)
    setNote(null)
    try {
      const prepared = await prepareReceipt(file)
      const failed = await enrolment.addReceipt(prepared.file)
      if (failed) {
        setProblem(failed)
      } else {
        setNote(prepared.converted ? 'The photo was saved as a PDF.' : 'Saved.')
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't save the receipt.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Step number={number} done={enrolment.receipts.length > 0} title="Payment receipt">
      {enrolment.receipts.map((receipt) => (
        <div key={receipt.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => void enrolment.openReceipt(receipt).then(setProblem)}
            className="flex min-w-0 items-center gap-1.5 text-left font-medium text-slate-800 hover:underline"
          >
            <FilePdf size={16} aria-hidden="true" className="shrink-0 text-red-600" />
            <span className="truncate">{receipt.name}</span>
          </button>
          <span className="shrink-0 text-slate-500">{formatDate(receipt.createdAt.slice(0, 10))}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => void enrolment.removeReceipt(receipt).then(setProblem)}
              aria-label={`Remove ${receipt.name}`}
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
            >
              <Trash size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <label className="block">
          <span className="text-slate-600">Upload the receipt (a PDF, or a photo that becomes a PDF)</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            disabled={uploading}
            onChange={(event) => {
              void choose(event.target.files?.[0])
              event.target.value = ''
            }}
            className="mt-1 block w-full text-xs"
          />
        </label>
      )}
      {uploading && <p className="text-slate-500">Saving...</p>}
      {note && <p className="text-emerald-700">{note}</p>}
      <Problem text={problem} />
    </Step>
  )
}

// The Zoom meeting arranged with the parent (the link is different each time).
export function ZoomStep({
  number,
  enrolment,
  canEdit,
  hint,
}: {
  number: number
  enrolment: Enrolment
  canEdit: boolean
  // A line shown above the meetings, such as "usually set after the form is filled in".
  hint?: string | null
}) {
  const [at, setAt] = useState('')
  const [link, setLink] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const startsAt = new Date(at)
    if (!at || Number.isNaN(startsAt.getTime())) {
      setProblem('Pick the date and time of the meeting.')
      return
    }
    if (!/^https?:\/\/\S+$/i.test(link.trim())) {
      setProblem('Paste the Zoom link, starting with https://')
      return
    }
    setSaving(true)
    setProblem(null)
    const failed = await enrolment.addMeeting(startsAt, link)
    setSaving(false)
    if (failed) {
      setProblem(failed)
      return
    }
    setAt('')
    setLink('')
  }

  return (
    <Step number={number} done={enrolment.meetings.length > 0} title="Zoom with the parent">
      {hint && <p className="text-slate-500">{hint}</p>}
      {enrolment.meetings.map((meeting) => (
        <div key={meeting.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <span className="min-w-0">
            <span className="block font-medium text-slate-900">{formatZoomTime(new Date(meeting.startsAt))}</span>
            <a href={meeting.link} target="_blank" rel="noopener noreferrer" className="block truncate text-[#be185d] hover:underline">
              {meeting.link}
            </a>
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => void enrolment.removeMeeting(meeting).then(setProblem)}
              aria-label="Remove this Zoom meeting"
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
            >
              <Trash size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <label className="block">
            <span className="text-slate-600">Date and time</span>
            <input
              type="datetime-local"
              value={at}
              onChange={(event) => {
                setAt(event.target.value)
                setProblem(null)
              }}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Zoom link (it is different each time)</span>
            <input
              type="url"
              value={link}
              placeholder="https://zoom.us/j/..."
              onChange={(event) => {
                setLink(event.target.value)
                setProblem(null)
              }}
              className={fieldClass}
            />
          </label>
          <Problem text={problem} />
          <button type="button" disabled={saving} onClick={() => void save()} className={`${buttonClass} w-full`}>
            {saving ? 'Saving...' : 'Save the Zoom meeting'}
          </button>
        </>
      )}
    </Step>
  )
}
