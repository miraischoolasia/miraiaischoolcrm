import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowClockwise, Bank, Copy, DownloadSimple, Paperclip, PaperPlaneTilt, Prohibit, SealCheck } from '@phosphor-icons/react'
import { downloadFile, quotationPdf } from '../../lib/quotationPdf'
import { cn } from '../../lib/cn'
import type { Classroom, Lead } from '../../types/domain'
import { fetchFeeCalculatorData, type FeeCalculatorData } from '../../lib/feeCalculator/api'
import { useAgeGroups } from '../../lib/ageGroups'
import {
  approveQuotation,
  cancelQuotation,
  fetchChatQuotations,
  fetchClassSizes,
  fetchClassTimes,
  fetchQuotationSettings,
  fetchStaffOptions,
  guessAgeGroup,
  markQuotationPaid,
  pdfPublicQuotation,
  uploadPaymentProof,
  renewQuotation,
  retryQuotation,
  sendQuotation,
  type QuotationRow,
  type StaffOption,
} from '../../lib/quotationApi'
import {
  bankReady,
  checkBankPayment,
  discountNeedsApproval,
  linkMessage,
  priceQuotation,
  quoteUrl,
  DEFAULT_QUOTATION_SETTINGS,
  type DiscountKind,
  type PaymentRoute,
  type PriceBook,
  type QuotationSettings,
} from '../../../supabase/functions/_shared/quotation/logic.ts'
import type { Region } from '../../lib/feeCalculator/types'
import type { FeeLevel } from '../../lib/feeCalculator/quote'
import { MONTH_NAMES } from '../feeCalculator/labels'

// The Inbox's Quotation tab (the chat's right panel): the EC makes a quotation, the price comes from the Fee
// Calculator's maths (the quotation function works it out again and keeps it), and the parent's link goes into the
// message box. Below: this chat's quotations and what happened to them.

export type QuotationChat = { conversationId: number | null; contactId: number | null; inboxId: number | null; phone: string | null }

export type QuotationApi = {
  loadFees: () => Promise<FeeCalculatorData | null>
  loadSettings: () => Promise<QuotationSettings>
  loadStaff: () => Promise<StaffOption[]>
  loadQuotations: (conversationId: number | null, leadId: number | null) => Promise<QuotationRow[]>
  loadClassTimes: (ids: number[]) => Promise<Map<number, string>>
  loadClassSizes: (ids: number[]) => Promise<Map<number, number>>
  send: typeof sendQuotation
  approve: typeof approveQuotation
  cancel: typeof cancelQuotation
  renew: typeof renewQuotation
  retry: typeof retryQuotation
  // Plan B: the quotation PDF and the EC confirming a bank transfer.
  loadPdfView: typeof pdfPublicQuotation
  uploadProof: typeof uploadPaymentProof
  markPaid: typeof markQuotationPaid
}

const databaseApi: QuotationApi = {
  loadFees: fetchFeeCalculatorData,
  loadSettings: fetchQuotationSettings,
  loadStaff: fetchStaffOptions,
  loadQuotations: fetchChatQuotations,
  loadClassTimes: fetchClassTimes,
  loadClassSizes: fetchClassSizes,
  send: sendQuotation,
  approve: approveQuotation,
  cancel: cancelQuotation,
  renew: renewQuotation,
  retry: retryQuotation,
  loadPdfView: pdfPublicQuotation,
  uploadProof: uploadPaymentProof,
  markPaid: markQuotationPaid,
}

const inputClass = 'min-h-9 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800'
const smallButton = 'inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40'

const STATUS_STYLE: Record<QuotationRow['status'], { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-slate-100 text-slate-600' },
  needs_approval: { label: 'Needs approval', tone: 'bg-amber-100 text-amber-800' },
  sent: { label: 'Sent', tone: 'bg-sky-100 text-sky-800' },
  viewed: { label: 'Opened', tone: 'bg-sky-100 text-sky-800' },
  confirmed: { label: 'Paying', tone: 'bg-violet-100 text-violet-800' },
  paid: { label: 'Paid', tone: 'bg-emerald-100 text-emerald-800' },
  expired: { label: 'Expired', tone: 'bg-slate-100 text-slate-500' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-500' },
}

function Label({ text, htmlFor }: { text: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-600">
      {text}
    </label>
  )
}

function bookOf(fees: FeeCalculatorData): PriceBook {
  return {
    cohorts: fees.cohorts.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive, materialsIncluded: c.materialsIncluded })),
    rates: fees.rates,
    subjects: fees.subjects.map((s) => ({ level: s.level, code: s.code, label: s.label, kind: s.kind, isActive: s.isActive })),
    globalRates: fees.globalRates,
    invoiceTemplate: fees.invoiceTemplate,
  }
}

export function QuotationPanel({
  lead,
  chat,
  classrooms,
  canApprove = false,
  onWriteMessage,
  onAttachFile,
  api = databaseApi,
  today = new Date(),
}: {
  lead: Lead | null
  chat: QuotationChat
  classrooms: Classroom[]
  canApprove?: boolean
  onWriteMessage: (text: string) => void
  // Puts a file (the quotation PDF) in the chat's message box; without it the PDF is only downloaded.
  onAttachFile?: (file: File) => void
  api?: QuotationApi
  today?: Date
}) {
  const ageGroups = useAgeGroups()
  const [fees, setFees] = useState<FeeCalculatorData | null>(null)
  const [settings, setSettings] = useState<QuotationSettings>(DEFAULT_QUOTATION_SETTINGS)
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [classTimes, setClassTimes] = useState<Map<number, string>>(new Map())
  const [classSizes, setClassSizes] = useState<Map<number, number>>(new Map())

  // The form.
  const firstChild = lead?.children[0] ?? null
  const [childName, setChildName] = useState(firstChild?.name ?? '')
  const [childAge, setChildAge] = useState<number | null>(firstChild?.age ?? null)
  const [ageGroup, setAgeGroup] = useState(() => guessAgeGroup(ageGroups, firstChild?.age ?? null))
  const [cohortId, setCohortId] = useState<number | null>(null)
  const [level, setLevel] = useState<FeeLevel>('primary')
  const [region, setRegion] = useState<Region>('west_malaysia')
  const [enrolMethod, setEnrolMethod] = useState(DEFAULT_QUOTATION_SETTINGS.enrolMethods[0].name)
  const [startYear, setStartYear] = useState(today.getFullYear())
  const [startMonth, setStartMonth] = useState(today.getMonth() + 1)
  const [chargeRegistration, setChargeRegistration] = useState(false)
  const [registrationMonth, setRegistrationMonth] = useState(today.getMonth() + 1)
  const [subjects, setSubjects] = useState<string[]>([])
  const [bioChePhy, setBioChePhy] = useState<string[]>([])
  const [classFor, setClassFor] = useState<Record<string, number>>({})
  const [discountKind, setDiscountKind] = useState<DiscountKind>('amount')
  const [discountValue, setDiscountValue] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [discountNote, setDiscountNote] = useState('')
  const [consultantId, setConsultantId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute>('bank_transfer')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const reloadList = useCallback(async () => {
    setQuotations(await api.loadQuotations(chat.conversationId, lead?.id ?? null))
  }, [api, chat.conversationId, lead?.id])

  useEffect(() => {
    let alive = true
    void Promise.all([api.loadFees(), api.loadSettings(), api.loadStaff(), api.loadQuotations(chat.conversationId, lead?.id ?? null)]).then(
      ([nextFees, nextSettings, nextStaff, nextQuotations]) => {
        if (!alive) return
        setFees(nextFees)
        setSettings(nextSettings)
        setStaff(nextStaff)
        setQuotations(nextQuotations)
        setEnrolMethod(nextSettings.enrolMethods[0]?.name ?? '')
        setPaymentRoute(nextSettings.paymentRoutes[0] ?? 'bank_transfer')
        setCohortId(nextFees?.cohorts.find((c) => c.isActive)?.id ?? null)
        setLoaded(true)
      },
    )
    return () => {
      alive = false
    }
  }, [api, chat.conversationId, lead?.id])

  const subjectList = useMemo(() => (fees ? fees.subjects.filter((s) => s.level === level && s.isActive) : []), [fees, level])
  const bioList = useMemo(() => (fees && level === 'secondary' ? fees.subjects.filter((s) => s.level === 'bio_che_phy' && s.isActive) : []), [fees, level])
  const ticked = useMemo(() => [...subjects, ...(level === 'secondary' ? bioChePhy : [])], [subjects, bioChePhy, level])

  // The open regular classes of the grade, and for a subject the ones of its class subject (when set).
  const classesFor = useCallback(
    (code: string) => {
      const subject = fees?.subjects.find((s) => s.code === code && (s.level === level || s.level === 'bio_che_phy'))
      return classrooms.filter(
        (c) =>
          c.status === 'active' &&
          c.category === 'regular' &&
          (!ageGroup || c.ageGroup === ageGroup) &&
          (!subject?.subjectId || c.subjectId === subject.subjectId),
      )
    },
    [classrooms, fees, level, ageGroup],
  )
  const candidateIds = useMemo(() => [...new Set(ticked.flatMap((code) => classesFor(code).map((c) => c.id)))], [ticked, classesFor])
  const candidateKey = candidateIds.join(',')
  useEffect(() => {
    if (!candidateKey) return
    const ids = candidateKey.split(',').map(Number)
    let alive = true
    void Promise.all([api.loadClassTimes(ids), api.loadClassSizes(ids)]).then(([times, sizes]) => {
      if (!alive) return
      setClassTimes(times)
      setClassSizes(sizes)
    })
    return () => {
      alive = false
    }
  }, [api, candidateKey])

  const discountNumber = Number(discountValue)
  const discount = discountValue.trim() !== '' && discountNumber > 0 ? { kind: discountKind, value: discountNumber, reason: discountReason, note: discountNote || null } : null
  const choices = {
    cohortId: cohortId ?? -1,
    level,
    region,
    enrolMethod,
    startYear,
    startMonth,
    registrationMonth: chargeRegistration ? registrationMonth : null,
    subjects,
    bioChePhy: level === 'secondary' ? bioChePhy : [],
    discount,
  }
  const priced = fees ? priceQuotation(choices, bookOf(fees), settings) : null
  const snapshot = priced?.snapshot ?? null
  const needsApproval = snapshot ? discountNeedsApproval(snapshot.subtotal, snapshot.discount?.amount ?? 0, settings) : false
  const missingClass = ticked.find((code) => !classFor[code])
  const problem = !childName.trim()
    ? 'Write the child’s name.'
    : priced?.error ??
      (missingClass
        ? `Pick a class for ${missingClass}.`
        : settings.lcRule === 'ec_picks' && !consultantId
          ? 'Pick the Learning Consultant.'
          : paymentRoute === 'bank_transfer' && !bankReady(settings)
            ? 'Write the school’s bank account in Quotation settings first.'
            : null)

  function toggle(list: string[], code: string, set: (next: string[]) => void) {
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code])
  }

  async function send() {
    if (!snapshot || problem) return
    setBusy(true)
    setMessage(null)
    const result = await api.send({
      leadId: lead?.id ?? null,
      conversationId: chat.conversationId,
      contactId: chat.contactId,
      inboxId: chat.inboxId,
      phone: chat.phone,
      childName: childName.trim(),
      childAge,
      ageGroup: ageGroup || null,
      choices,
      classes: ticked.map((code) => ({ subjectCode: code, classroomId: classFor[code] })),
      consultantId,
      paymentRoute,
      expectTotal: snapshot.total,
    })
    setBusy(false)
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error })
      return
    }
    if (result.url) {
      onWriteMessage(linkMessage(settings, childName.trim(), result.total, result.url))
      setMessage({ tone: 'ok', text: 'The link is in the message box. Press Send in the chat.' })
    } else if (result.status === 'needs_approval') {
      setMessage({ tone: 'ok', text: 'Waiting for a supervisor to approve the discount. You will get a notification.' })
    } else {
      setMessage({ tone: 'error', text: 'Saved, but the parent’s link address is not set (Quotation settings).' })
    }
    await reloadList()
  }

  // The quotation PDF, from the same answer the parent's page gets: downloaded, or put in the message box.
  async function pdf(q: QuotationRow, attach: boolean) {
    setBusy(true)
    setMessage(null)
    const reply = await api.loadPdfView(q.publicToken)
    if (!reply.ok) {
      setBusy(false)
      setMessage({ tone: 'error', text: reply.error })
      return
    }
    try {
      const file = await quotationPdf(reply.quotation)
      if (attach && onAttachFile) onAttachFile(file)
      else downloadFile(file)
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Could not make the PDF.' })
    }
    setBusy(false)
  }

  async function act(action: () => Promise<{ ok: boolean; error?: string; url?: string | null; total?: number }>, done: string) {
    setBusy(true)
    setMessage(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) setMessage({ tone: 'error', text: result.error ?? 'Did not work.' })
    else setMessage({ tone: 'ok', text: done })
    await reloadList()
    return result
  }

  if (!loaded) return <p className="text-sm text-slate-500" aria-busy="true">Loading…</p>
  if (!fees) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">The Fee Calculator’s prices could not be read.</p>
  }

  const years = [today.getFullYear(), today.getFullYear() + 1]

  return (
    <div className="space-y-4">
      {quotations.length > 0 && (
        <section aria-label="This chat’s quotations" className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">Quotations</h3>
          <ul className="space-y-2">
            {quotations.map((q) => {
              const style = STATUS_STYLE[q.status]
              const url = settings.publicBaseUrl ? quoteUrl(settings.publicBaseUrl, q.publicToken) : null
              return (
                <li key={q.id} className="space-y-1.5 rounded-xl border border-slate-200 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-semibold text-slate-800">{q.childName}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', style.tone)}>{style.label}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    RM{q.total.toFixed(2)}
                    {q.discountAmount > 0 && ` (RM${q.discountAmount.toFixed(2)} off)`}
                    {q.expiresAt && q.status !== 'paid' && ` · until ${new Date(q.expiresAt).toLocaleDateString()}`}
                    {q.paidAt && ` · paid ${new Date(q.paidAt).toLocaleDateString()}`}
                    {q.reference && ` · ${q.reference}`}
                  </div>
                  {q.status === 'paid' && q.fulfilStatus !== 'done' && (
                    <p role="alert" className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
                      {q.fulfilStatus === 'check' ? 'To check before enrolling: ' : 'Paid but not enrolled yet: '}
                      {q.fulfilError ?? 'working on it…'}
                    </p>
                  )}
                  {q.status === 'paid' && q.loginStatus === 'failed' && (
                    <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">The app login was not made. Make it on the App Logins page.</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {url && ['sent', 'viewed', 'confirmed'].includes(q.status) && (
                      <>
                        <button type="button" className={smallButton} onClick={() => onWriteMessage(linkMessage(settings, q.childName, q.total, url))}>
                          <PaperPlaneTilt size={14} aria-hidden="true" /> Put link in message
                        </button>
                        <button type="button" className={smallButton} onClick={() => void navigator.clipboard?.writeText(url)}>
                          <Copy size={14} aria-hidden="true" /> Copy link
                        </button>
                      </>
                    )}
                    {q.status === 'needs_approval' && canApprove && (
                      <button
                        type="button"
                        className={smallButton}
                        disabled={busy}
                        onClick={() =>
                          void act(() => api.approve(q.id), 'Approved: the EC can send the link now.').then((r) => {
                            if (r.ok && r.url) onWriteMessage(linkMessage(settings, q.childName, q.total, r.url))
                          })
                        }
                      >
                        <SealCheck size={14} aria-hidden="true" /> Approve discount
                      </button>
                    )}
                    {['needs_approval', 'sent', 'viewed', 'confirmed'].includes(q.status) && (
                      <button type="button" className={smallButton} disabled={busy} onClick={() => void act(() => api.cancel(q.id), 'Cancelled.')}>
                        <Prohibit size={14} aria-hidden="true" /> Cancel
                      </button>
                    )}
                    {(q.status === 'expired' || q.status === 'cancelled') && (
                      <button
                        type="button"
                        className={smallButton}
                        disabled={busy}
                        onClick={() =>
                          void act(() => api.renew(q.id), 'A new quotation at today’s prices.').then((r) => {
                            if (r.ok && r.url && typeof r.total === 'number') onWriteMessage(linkMessage(settings, q.childName, r.total, r.url))
                          })
                        }
                      >
                        <ArrowClockwise size={14} aria-hidden="true" /> Renew
                      </button>
                    )}
                    {q.status !== 'needs_approval' && q.status !== 'draft' && (
                      <button type="button" className={smallButton} disabled={busy} onClick={() => void pdf(q, false)}>
                        <DownloadSimple size={14} aria-hidden="true" /> PDF
                      </button>
                    )}
                    {onAttachFile && ['sent', 'viewed', 'confirmed'].includes(q.status) && (
                      <button type="button" className={smallButton} disabled={busy} onClick={() => void pdf(q, true)}>
                        <Paperclip size={14} aria-hidden="true" /> PDF in message
                      </button>
                    )}
                    {q.paymentRoute === 'bank_transfer' && ['sent', 'viewed', 'confirmed', 'expired'].includes(q.status) && markingId !== q.id && (
                      <button type="button" className={cn(smallButton, 'border-emerald-300 text-emerald-700')} disabled={busy} onClick={() => setMarkingId(q.id)}>
                        <Bank size={14} aria-hidden="true" /> Mark as paid
                      </button>
                    )}
                    {q.status === 'paid' && (q.fulfilStatus === 'failed' || (q.fulfilStatus === 'check' && canApprove) || q.loginStatus === 'failed') && (
                      <button type="button" className={smallButton} disabled={busy} onClick={() => void act(() => api.retry(q.id), 'Done.')}>
                        <ArrowClockwise size={14} aria-hidden="true" /> {q.fulfilStatus === 'check' ? 'Checked: enrol' : 'Run again'}
                      </button>
                    )}
                  </div>
                  {markingId === q.id && (
                    <MarkPaidForm
                      quotation={q}
                      api={api}
                      today={today}
                      onCancel={() => setMarkingId(null)}
                      onDone={async (text) => {
                        setMarkingId(null)
                        setMessage({ tone: 'ok', text })
                        await reloadList()
                      }}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section aria-label="New quotation" className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">New quotation</h3>
        <div className="grid grid-cols-[1fr_4rem] gap-2">
          <div>
            <Label text="Child" htmlFor="quote-child" />
            <input
              id="quote-child"
              list="quote-children"
              className={inputClass}
              value={childName}
              onChange={(e) => {
                setChildName(e.target.value)
                const child = lead?.children.find((c) => c.name === e.target.value)
                if (child) {
                  setChildAge(child.age)
                  setAgeGroup(guessAgeGroup(ageGroups, child.age) || ageGroup)
                }
              }}
            />
            <datalist id="quote-children">
              {lead?.children.map((c) => <option key={c.name} value={c.name} />)}
            </datalist>
          </div>
          <div>
            <Label text="Age" htmlFor="quote-age" />
            <input
              id="quote-age"
              type="number"
              inputMode="numeric"
              min={2}
              max={25}
              className={inputClass}
              value={childAge ?? ''}
              onChange={(e) => {
                const age = e.target.value === '' ? null : Number(e.target.value)
                setChildAge(age)
                const guess = guessAgeGroup(ageGroups, age)
                if (guess) setAgeGroup(guess)
              }}
            />
          </div>
        </div>
        <div>
          <Label text="Grade (lists its classes)" htmlFor="quote-grade" />
          <select id="quote-grade" className={inputClass} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            <option value="">Every grade</option>
            {ageGroups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <div>
            <Label text="Membership" htmlFor="quote-cohort" />
            <select id="quote-cohort" className={inputClass} value={cohortId ?? ''} onChange={(e) => setCohortId(Number(e.target.value))}>
              {fees.cohorts
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label text="How they enrol" htmlFor="quote-method" />
            <select id="quote-method" className={inputClass} value={enrolMethod} onChange={(e) => setEnrolMethod(e.target.value)}>
              {settings.enrolMethods.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label text="Level" htmlFor="quote-level" />
            <select
              id="quote-level"
              className={inputClass}
              value={level}
              onChange={(e) => {
                setLevel(e.target.value as FeeLevel)
                setSubjects([])
                setBioChePhy([])
              }}
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
          </div>
          <div>
            <Label text="Region" htmlFor="quote-region" />
            <select id="quote-region" className={inputClass} value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              <option value="west_malaysia">West Malaysia</option>
              <option value="east_malaysia">East Malaysia</option>
            </select>
          </div>
          <div>
            <Label text="Start month" htmlFor="quote-start-month" />
            <div className="flex gap-1">
              <select aria-label="Start year" className={inputClass} value={startYear} onChange={(e) => setStartYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select id="quote-start-month" aria-label="Start month" className={inputClass} value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label text="Registration fee" />
            <div className="flex min-h-9 items-center gap-1.5 text-xs text-slate-700">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={chargeRegistration} onChange={(e) => setChargeRegistration(e.target.checked)} />
                Charge
              </label>
              {/* Outside the label: a click on the month must not untick the box. */}
              {chargeRegistration && (
                <select aria-label="Registration month" className="min-h-8 rounded-lg border border-slate-200 px-1 text-xs" value={registrationMonth} onChange={(e) => setRegistrationMonth(Number(e.target.value))}>
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label text="Subjects and classes" />
          {[...subjectList, ...bioList].map((s) => {
            const isBio = s.level === 'bio_che_phy'
            const on = isBio ? bioChePhy.includes(s.code) : subjects.includes(s.code)
            const options = on ? classesFor(s.code) : []
            return (
              <div key={`${s.level}-${s.code}`} className={cn('rounded-xl border px-2 py-1.5', on ? 'border-[#fc0c97]/40 bg-[#fff1f8]/40' : 'border-slate-200')}>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={on} onChange={() => (isBio ? toggle(bioChePhy, s.code, setBioChePhy) : toggle(subjects, s.code, setSubjects))} />
                  <span className="w-10 shrink-0 text-xs font-bold">{s.code}</span>
                  <span className="truncate">{s.label}</span>
                </label>
                {on && (
                  <select
                    aria-label={`Class for ${s.code}`}
                    className={cn(inputClass, 'mt-1.5')}
                    value={classFor[s.code] ?? ''}
                    onChange={(e) => setClassFor({ ...classFor, [s.code]: Number(e.target.value) })}
                  >
                    <option value="">{options.length === 0 ? 'No open class for this grade' : 'Pick a class'}</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {classTimes.get(c.id) ? ` · ${classTimes.get(c.id)}` : ''} · {classSizes.get(c.id) ?? 0} students
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>

        <div className="grid gap-2">
          <div>
            <Label text="Discount" htmlFor="quote-discount" />
            <div className="flex">
              <input
                id="quote-discount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className={cn(inputClass, 'rounded-r-none')}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
              <button
                type="button"
                aria-label={discountKind === 'amount' ? 'Discount in ringgit (switch to percent)' : 'Discount in percent (switch to ringgit)'}
                className="min-h-9 rounded-r-xl border border-l-0 border-slate-200 px-2 text-xs font-semibold text-slate-600"
                onClick={() => setDiscountKind(discountKind === 'amount' ? 'percent' : 'amount')}
              >
                {discountKind === 'amount' ? 'RM' : '%'}
              </button>
            </div>
          </div>
          <div>
            <Label text="Reason" htmlFor="quote-reason" />
            <select id="quote-reason" className={inputClass} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} disabled={!discount}>
              <option value="">Pick a reason</option>
              {settings.discountReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
        {discount && (
          <input aria-label="Discount note" placeholder="Note (optional)" className={inputClass} value={discountNote} maxLength={300} onChange={(e) => setDiscountNote(e.target.value)} />
        )}

        {settings.paymentRoutes.length > 1 && (
          <div>
            <Label text="The parent pays by" htmlFor="quote-route" />
            <select id="quote-route" className={inputClass} value={paymentRoute} onChange={(e) => setPaymentRoute(e.target.value as PaymentRoute)}>
              <option value="bank_transfer">Bank transfer (you confirm it with the receipt)</option>
              <option value="razorpay">Razorpay online payment</option>
            </select>
          </div>
        )}
        {paymentRoute === 'bank_transfer' && !bankReady(settings) && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">The school’s bank account is not written yet (Fee Calculator → Price settings → Quotations).</p>
        )}

        <div>
          <Label text={settings.lcRule === 'ec_picks' ? 'Learning Consultant' : 'Learning Consultant (optional)'} htmlFor="quote-lc" />
          <select id="quote-lc" className={inputClass} value={consultantId ?? ''} onChange={(e) => setConsultantId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Pick a staff member</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          {snapshot ? (
            <>
              <ul className="space-y-1 text-xs text-slate-600">
                {snapshot.lines.map((line, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{line.description}</span>
                    <span className="shrink-0 tabular-nums">RM{line.amount.toFixed(2)}</span>
                  </li>
                ))}
                {snapshot.discount && (
                  <li className="flex justify-between gap-2 text-emerald-700">
                    <span>Discount ({snapshot.discount.reason})</span>
                    <span className="shrink-0 tabular-nums">-RM{snapshot.discount.amount.toFixed(2)}</span>
                  </li>
                )}
              </ul>
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="text-sm font-semibold text-slate-800">Total</span>
                <span className="text-lg font-bold tabular-nums text-[#be185d]" data-testid="quote-total">
                  RM{snapshot.total.toFixed(2)}
                </span>
              </div>
              {needsApproval && <p className="mt-1 text-xs font-semibold text-amber-700">Over the discount cap: a supervisor approves it before the link can be sent.</p>}
            </>
          ) : (
            <p className="text-xs text-slate-500">{priced?.error ?? 'Choose the subjects to see the price.'}</p>
          )}
        </div>

        {message && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={cn('text-sm', message.tone === 'error' ? 'text-red-700' : 'text-emerald-700')}>
            {message.text}
          </p>
        )}
        <button
          type="button"
          className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
          disabled={busy || Boolean(problem) || !snapshot}
          title={problem ?? undefined}
          onClick={() => void send()}
        >
          <PaperPlaneTilt size={16} aria-hidden="true" />
          {busy ? 'Sending…' : needsApproval ? 'Send for approval' : 'Send quotation'}
        </button>
        {problem && snapshot && <p className="text-xs text-slate-500">{problem}</p>}
      </section>
    </div>
  )
}

// Plan B: the parent paid by bank transfer. The EC writes what arrived, adds the parent's receipt (required) and
// submits once; the server checks it all again and runs the same steps as a Razorpay payment.
function MarkPaidForm({
  quotation,
  api,
  today,
  onCancel,
  onDone,
}: {
  quotation: QuotationRow
  api: QuotationApi
  today: Date
  onCancel: () => void
  onDone: (text: string) => Promise<void>
}) {
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [paidOn, setPaidOn] = useState(todayText)
  const [amount, setAmount] = useState(quotation.total.toFixed(2))
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amountNumber = Number(amount)
  const check = checkBankPayment({ paidOn, amount: amountNumber, reference, note, proofPath: file ? 'chosen' : null }, quotation.total, todayText)

  async function submit() {
    if (!file || !check.ok || busy) return
    setBusy(true)
    setError(null)
    const uploaded = await api.uploadProof(quotation.id, file)
    if (!uploaded.ok) {
      setBusy(false)
      setError(uploaded.error)
      return
    }
    const result = await api.markPaid(quotation.id, { paidOn, amount: amountNumber, reference: reference || null, note: note || null, proofPath: uploaded.path })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await onDone(
      'waiting' in result && result.waiting
        ? 'Marked paid. An admin checks the receipt before the child is enrolled.'
        : 'Marked paid: the child is being enrolled and the login sent.',
    )
  }

  return (
    <form
      aria-label={`Mark ${quotation.childName}’s quotation as paid`}
      className="mt-2 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="grid gap-2">
        <div>
          <Label text="Transfer date" htmlFor={`paid-on-${quotation.id}`} />
          <input id={`paid-on-${quotation.id}`} type="date" max={todayText} className={inputClass} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
        <div>
          <Label text="Amount received (RM)" htmlFor={`paid-amount-${quotation.id}`} />
          <input id={`paid-amount-${quotation.id}`} type="number" inputMode="decimal" min={0} step="0.01" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
      {check.amountDiffers && (
        <p className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Not the quotation’s RM{quotation.total.toFixed(2)}. Write why below.</p>
      )}
      <div>
        <Label text="Bank reference (optional)" htmlFor={`paid-ref-${quotation.id}`} />
        <input id={`paid-ref-${quotation.id}`} className={inputClass} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      {check.amountDiffers && (
        <div>
          <Label text="Why the amount differs" htmlFor={`paid-note-${quotation.id}`} />
          <input id={`paid-note-${quotation.id}`} className={inputClass} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      <div>
        <Label text="The parent’s receipt (photo or PDF)" htmlFor={`paid-file-${quotation.id}`} />
        <input id={`paid-file-${quotation.id}`} type="file" accept="application/pdf,image/*" className="block w-full text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {!check.ok && file !== null && <p className="text-xs text-slate-500">{check.errors.join(' ')}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex min-h-9 items-center rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || !check.ok}
          onClick={() => void submit()}
        >
          {busy ? 'Submitting…' : 'Submit'}
        </button>
        <button type="button" className={smallButton} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
