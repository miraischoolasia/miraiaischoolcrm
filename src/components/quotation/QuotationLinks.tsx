import { useEffect, useState } from 'react'
import { Trash, UploadSimple } from '@phosphor-icons/react'
import {
  fetchMyTeacherId,
  fetchStaffLinks,
  fetchStaffOptions,
  saveStaffLink,
  schoolQrUrl,
  uploadSchoolQr,
  type StaffLink,
  type StaffOption,
} from '../../lib/quotationApi'
import { safeHttpsUrl } from '../../../supabase/functions/_shared/quotation/logic.ts'

// §15 (boss 2026-10-23): the school's bank QR picture, and each EC's after-payment / contact links.

const inputClass = 'min-h-9 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800'
const smallButton = 'inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40'

const linkProblem = (value: string) => (value.trim() && !safeHttpsUrl(value) ? 'A link must start with https:// and have no spaces.' : null)

// Admin: the school's QR picture for bank transfers (public bucket). The path goes into the settings draft;
// the settings card saves it with the rest.
export function SchoolQrField({
  path,
  onChange,
  upload = uploadSchoolQr,
  urlFor = schoolQrUrl,
}: {
  path: string | null
  onChange: (path: string | null) => void
  upload?: typeof uploadSchoolQr
  urlFor?: (path: string) => string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    const result = await upload(file)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onChange(result.path)
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-600">Bank / DuitNow QR (shown beside the bank details on the parent’s page and the PDF)</div>
      {path ? (
        <div className="flex items-center gap-3">
          <img src={urlFor(path)} alt="School bank QR" className="h-28 w-28 rounded-xl border border-slate-200 object-contain" />
          <div className="flex flex-col gap-2">
            <label className={smallButton}>
              <UploadSimple size={14} aria-hidden="true" /> Change
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} disabled={busy} />
            </label>
            <button type="button" className={smallButton} onClick={() => onChange(null)} disabled={busy}>
              <Trash size={14} aria-hidden="true" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <label className={smallButton}>
          <UploadSimple size={14} aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload QR picture'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload QR picture" onChange={(e) => void choose(e.target.files?.[0])} disabled={busy} />
        </label>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      <p className="text-xs text-slate-500">PNG, JPG or WebP, up to 2 MB. Press “Save quotation settings” after changing it.</p>
    </div>
  )
}

function LinkRow({
  label,
  link,
  onSave,
}: {
  label: string
  link: StaffLink | null
  onSave: (afterPayUrl: string | null, contactUrl: string | null) => Promise<string | null>
}) {
  const [afterPay, setAfterPay] = useState(link?.afterPayUrl ?? '')
  const [contact, setContact] = useState(link?.contactUrl ?? '')
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false })
  const problem = linkProblem(afterPay) ?? linkProblem(contact)

  async function save() {
    setState({ busy: true, error: null, saved: false })
    const error = await onSave(afterPay.trim() || null, contact.trim() || null)
    setState({ busy: false, error, saved: !error })
  }

  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs font-semibold text-slate-700">{label}</div>}
      <input
        aria-label={`After paying, go to${label ? ` (${label})` : ''}`}
        placeholder="After paying, go to (https://wa.me/60…)"
        className={inputClass}
        value={afterPay}
        onChange={(e) => {
          setAfterPay(e.target.value)
          setState({ busy: false, error: null, saved: false })
        }}
      />
      <input
        aria-label={`Wrong details? Contact (${label || 'me'})`}
        placeholder="“资料不对” contact link (optional, https://wa.me/60…)"
        className={inputClass}
        value={contact}
        onChange={(e) => {
          setContact(e.target.value)
          setState({ busy: false, error: null, saved: false })
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallButton} disabled={state.busy || Boolean(problem)} onClick={() => void save()}>
          {state.busy ? 'Saving…' : 'Save links'}
        </button>
        {problem && <span className="text-xs text-amber-700">{problem}</span>}
        {state.error && (
          <span role="alert" className="text-xs text-red-700">
            {state.error}
          </span>
        )}
        {state.saved && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
    </div>
  )
}

// Admin: every staff member's links (in the quotation settings card).
export function StaffLinksEditor({
  loadStaff = fetchStaffOptions,
  loadLinks = fetchStaffLinks,
  save = saveStaffLink,
}: {
  loadStaff?: () => Promise<StaffOption[]>
  loadLinks?: () => Promise<StaffLink[]>
  save?: typeof saveStaffLink
}) {
  const [staff, setStaff] = useState<StaffOption[] | null>(null)
  const [links, setLinks] = useState<StaffLink[]>([])

  useEffect(() => {
    let alive = true
    void Promise.all([loadStaff(), loadLinks()]).then(([nextStaff, nextLinks]) => {
      if (!alive) return
      setStaff(nextStaff)
      setLinks(nextLinks)
    })
    return () => {
      alive = false
    }
  }, [loadStaff, loadLinks])

  if (!staff) return null
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-slate-600">Each EC’s links (empty = the school’s link above; each EC can also set their own in the Inbox’s Quotation tab)</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {staff.map((person) => (
          <div key={person.id} className="rounded-xl border border-slate-200 p-2.5">
            <LinkRow label={person.name} link={links.find((l) => l.teacherId === person.id) ?? null} onSave={(a, c) => save(person.id, a, c)} />
          </div>
        ))}
      </div>
    </div>
  )
}

// The Inbox's Quotation tab: the signed-in EC's own links (kept on each quotation when it is sent).
export function MyQuotationLinks({
  loadMe = fetchMyTeacherId,
  loadLinks = fetchStaffLinks,
  save = saveStaffLink,
}: {
  loadMe?: () => Promise<number | null>
  loadLinks?: () => Promise<StaffLink[]>
  save?: typeof saveStaffLink
}) {
  const [me, setMe] = useState<number | null>(null)
  const [link, setLink] = useState<StaffLink | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([loadMe(), loadLinks()]).then(([id, all]) => {
      if (!alive) return
      setMe(id)
      setLink(all.find((l) => l.teacherId === id) ?? null)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [loadMe, loadLinks])

  if (!loaded || me === null) return null
  return (
    <details className="rounded-xl border border-slate-200 p-2.5">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
        My links {link?.afterPayUrl ? '· set' : '· not set (the school’s link is used)'}
      </summary>
      <div className="mt-2 space-y-1">
        <p className="text-xs text-slate-500">Where a parent goes after paying, and where “资料不对” goes. Used for quotations you send from now on.</p>
        <LinkRow label="" link={link} onSave={(a, c) => save(me, a, c)} />
      </div>
    </details>
  )
}
