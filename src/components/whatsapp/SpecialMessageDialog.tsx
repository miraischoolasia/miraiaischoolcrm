import { useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import type { SpecialMessage } from '../../lib/waActions'

export type SpecialKind = SpecialMessage['kind']

const TITLES: Record<SpecialKind, string> = {
  location: 'Send a location',
  contact: 'Send a contact',
  poll: 'Send a poll',
  sticker: 'Send a sticker',
}

const fieldClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#fc0c97]'
const MAX_POLL_OPTIONS = 12

// Builds what to send from the form, or says what is missing.
function build(
  kind: SpecialKind,
  values: { name: string; address: string; latitude: string; longitude: string; fullName: string; phone: string; question: string; options: string[]; multiple: boolean; file: File | null },
): SpecialMessage | string {
  if (kind === 'location') {
    const latitude = Number(values.latitude)
    const longitude = Number(values.longitude)
    if (!values.latitude.trim() || !values.longitude.trim() || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return 'Write the latitude and longitude as numbers, for example 3.139 and 101.6869.'
    }
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return 'That place is not on the map. Latitude is up to 90 and longitude up to 180.'
    }
    return { kind, latitude, longitude, name: values.name.trim(), address: values.address.trim() }
  }
  if (kind === 'contact') {
    if (!values.fullName.trim()) {
      return 'Write the name of the contact.'
    }
    if (values.phone.replace(/\D/g, '').length < 8) {
      return 'Write the phone number with its country code, for example 60123456789.'
    }
    return { kind, fullName: values.fullName.trim(), phone: values.phone }
  }
  if (kind === 'poll') {
    const options = values.options.map((option) => option.trim()).filter(Boolean)
    if (!values.question.trim()) {
      return 'Write the question.'
    }
    if (options.length < 2) {
      return 'A poll needs at least two answers.'
    }
    return { kind, question: values.question.trim(), options, selectableCount: values.multiple ? options.length : 1 }
  }
  if (!values.file) {
    return 'Choose a picture for the sticker.'
  }
  return { kind, file: values.file }
}

// A small form for one of the things WhatsApp can send besides text and files.
export function SpecialMessageDialog({
  kind,
  onClose,
  onSend,
}: {
  kind: SpecialKind
  onClose: () => void
  // Null when it went out, otherwise what to tell the person.
  onSend: (message: SpecialMessage) => Promise<string | null>
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multiple, setMultiple] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  async function send() {
    const built = build(kind, { name, address, latitude, longitude, fullName, phone, question, options, multiple, file })
    if (typeof built === 'string') {
      setError(built)
      return
    }
    setIsSending(true)
    setError(null)
    const problem = await onSend(built)
    setIsSending(false)
    if (problem) {
      setError(problem)
      return
    }
    onClose()
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
        <h2 className="text-xl font-semibold text-slate-900">{TITLES[kind]}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
          <X size={16} />
        </button>
      </div>
      <div data-modal-body className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-6">
        {kind === 'location' && (
          <>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Place name (optional)</span>
              <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Address (optional)</span>
              <input value={address} onChange={(event) => setAddress(event.target.value)} className={fieldClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Latitude</span>
                <input value={latitude} inputMode="decimal" onChange={(event) => setLatitude(event.target.value)} placeholder="3.139" className={fieldClass} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Longitude</span>
                <input value={longitude} inputMode="decimal" onChange={(event) => setLongitude(event.target.value)} placeholder="101.6869" className={fieldClass} />
              </label>
            </div>
            <p className="text-xs text-slate-500">In Google Maps, right-click a place and click the two numbers at the top of the menu to copy them.</p>
          </>
        )}

        {kind === 'contact' && (
          <>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Name</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Phone number</span>
              <input value={phone} type="tel" onChange={(event) => setPhone(event.target.value)} placeholder="60123456789" className={fieldClass} />
            </label>
          </>
        )}

        {kind === 'poll' && (
          <>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Question</span>
              <input value={question} onChange={(event) => setQuestion(event.target.value)} className={fieldClass} />
            </label>
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Answers</span>
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    value={option}
                    aria-label={`Answer ${index + 1}`}
                    onChange={(event) => setOptions((current) => current.map((entry, position) => (position === index ? event.target.value : entry)))}
                    className={fieldClass}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((current) => current.filter((_, position) => position !== index))}
                      aria-label={`Remove answer ${index + 1}`}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {options.length < MAX_POLL_OPTIONS && (
                <button
                  type="button"
                  onClick={() => setOptions((current) => [...current, ''])}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={14} aria-hidden="true" />
                  Add an answer
                </button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={multiple} onChange={(event) => setMultiple(event.target.checked)} />
              They can pick more than one answer
            </label>
          </>
        )}

        {kind === 'sticker' && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Picture (a square PNG or WebP works best)</span>
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3">
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={isSending}
          onClick={() => void send()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-60"
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </ModalShell>
  )
}
