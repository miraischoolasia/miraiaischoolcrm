import { useEffect, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { fetchQuotationSettings, saveQuotationSettings } from '../../lib/quotationApi'
import { DEFAULT_QUOTATION_SETTINGS, type EnrolMethodPlan, type PaymentRoute, type QuotationSettings } from '../../../supabase/functions/_shared/quotation/logic.ts'
import { RATE_TIERS } from '../feeCalculator/labels'

// Admin: the school's quotation rules (app_settings 'quotations'). Off at Mirai; EduHero switches it on. Every list
// and number here is the school's own (white label).

const inputClass = 'min-h-9 w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800'

export function QuotationSettingsCard({
  load = fetchQuotationSettings,
  save = saveQuotationSettings,
}: {
  load?: () => Promise<QuotationSettings>
  save?: (settings: QuotationSettings) => Promise<string | null>
}) {
  const [draft, setDraft] = useState<QuotationSettings | null>(null)
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false })

  useEffect(() => {
    let alive = true
    void load().then((value) => alive && setDraft(value))
    return () => {
      alive = false
    }
  }, [load])

  if (!draft) return null
  const set = (changes: Partial<QuotationSettings>) => {
    setDraft({ ...draft, ...changes })
    setState({ busy: false, error: null, saved: false })
  }
  const setMethod = (index: number, changes: Partial<EnrolMethodPlan>) => set({ enrolMethods: draft.enrolMethods.map((m, i) => (i === index ? { ...m, ...changes } : m)) })

  async function submit() {
    if (!draft) return
    if (draft.enabled && !/^https:\/\//.test(draft.publicBaseUrl)) {
      setState({ busy: false, error: 'Write the address parents open (https://…) before switching quotations on.', saved: false })
      return
    }
    if (draft.enabled && draft.paymentRoutes.includes('bank_transfer') && !(draft.bank.bankName.trim() && draft.bank.accountNumber.trim())) {
      setState({ busy: false, error: 'Write the bank and the account number for bank transfers.', saved: false })
      return
    }
    setState({ busy: true, error: null, saved: false })
    const error = await save(draft)
    setState({ busy: false, error, saved: !error })
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Quotations (Inbox → parent’s link → Razorpay)</h2>
        <p className="text-xs text-slate-500">Admin only. The prices come from this page; these are the rules around them.</p>
      </div>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Use quotations at this school
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="qs-url" className="mb-1 block text-xs font-semibold text-slate-600">
            Address parents open (this CRM’s address)
          </label>
          <input id="qs-url" className={inputClass} placeholder="https://crm.example.com" value={draft.publicBaseUrl} onChange={(e) => set({ publicBaseUrl: e.target.value.trim() })} />
        </div>
        <div>
          <label htmlFor="qs-days" className="mb-1 block text-xs font-semibold text-slate-600">
            A quotation is open for (days)
          </label>
          <input id="qs-days" type="number" min={1} max={60} className={inputClass} value={draft.expiryDays} onChange={(e) => set({ expiryDays: Number(e.target.value) })} />
        </div>
        <div>
          <label htmlFor="qs-cap-p" className="mb-1 block text-xs font-semibold text-slate-600">
            Discount without approval: up to %
          </label>
          <input id="qs-cap-p" type="number" min={0} max={100} className={inputClass} value={draft.discountCapPercent} onChange={(e) => set({ discountCapPercent: Number(e.target.value) })} />
        </div>
        <div>
          <label htmlFor="qs-cap-a" className="mb-1 block text-xs font-semibold text-slate-600">
            … and up to RM
          </label>
          <input id="qs-cap-a" type="number" min={0} className={inputClass} value={draft.discountCapAmount} onChange={(e) => set({ discountCapAmount: Number(e.target.value) })} />
        </div>
        <div>
          <label htmlFor="qs-lc" className="mb-1 block text-xs font-semibold text-slate-600">
            Learning Consultant
          </label>
          <select id="qs-lc" className={inputClass} value={draft.lcRule} onChange={(e) => set({ lcRule: e.target.value as QuotationSettings['lcRule'] })}>
            <option value="ec_picks">The EC picks (required)</option>
            <option value="round_robin" disabled>
              Take turns (later)
            </option>
            <option value="by_subject" disabled>
              By subject (later)
            </option>
          </select>
        </div>
        <div>
          <label htmlFor="qs-reasons" className="mb-1 block text-xs font-semibold text-slate-600">
            Discount reasons (one per line)
          </label>
          <textarea
            id="qs-reasons"
            rows={4}
            className={inputClass}
            value={draft.discountReasons.join('\n')}
            onChange={(e) => set({ discountReasons: e.target.value.split('\n').map((r) => r.trim()).filter(Boolean) })}
          />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-xs font-semibold text-slate-600">How parents pay</legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ['bank_transfer', 'Bank transfer (the EC confirms it with the receipt)'],
              ['razorpay', 'Razorpay online payment (needs the Razorpay keys)'],
            ] as [PaymentRoute, string][]
          ).map(([route, label]) => (
            <label key={route} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.paymentRoutes.includes(route)}
                disabled={draft.paymentRoutes.length === 1 && draft.paymentRoutes.includes(route)}
                onChange={(e) =>
                  set({ paymentRoutes: e.target.checked ? [...draft.paymentRoutes, route] : draft.paymentRoutes.filter((r) => r !== route) })
                }
              />
              {label}
            </label>
          ))}
        </div>
        {draft.paymentRoutes.includes('bank_transfer') && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['bankName', 'Bank', 80],
                  ['accountName', 'Account name', 120],
                  ['accountNumber', 'Account number', 40],
                ] as const
              ).map(([key, label, max]) => (
                <div key={key}>
                  <label htmlFor={`qs-bank-${key}`} className="mb-1 block text-xs font-semibold text-slate-600">
                    {label}
                  </label>
                  <input id={`qs-bank-${key}`} className={inputClass} maxLength={max} value={draft.bank[key]} onChange={(e) => set({ bank: { ...draft.bank, [key]: e.target.value } })} />
                </div>
              ))}
            </div>
            <div>
              <label htmlFor="qs-bank-note" className="mb-1 block text-xs font-semibold text-slate-600">
                Note under the bank details (page and PDF)
              </label>
              <textarea id="qs-bank-note" rows={2} className={inputClass} value={draft.bankNote} onChange={(e) => set({ bankNote: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.bankReview} onChange={(e) => set({ bankReview: e.target.checked })} />
              An admin checks each bank transfer before the child is enrolled
            </label>
          </>
        )}
      </fieldset>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-600">How they enrol → price column and months (names as in Student fields)</div>
        {draft.enrolMethods.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_9rem_5rem_auto] gap-2">
            <input aria-label="Name" className={inputClass} value={m.name} onChange={(e) => setMethod(i, { name: e.target.value })} />
            <select aria-label="Price column" className={inputClass} value={m.rateTier} onChange={(e) => setMethod(i, { rateTier: e.target.value as EnrolMethodPlan['rateTier'] })}>
              {RATE_TIERS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <input aria-label="Months" type="number" min={1} max={24} className={inputClass} value={m.months} onChange={(e) => setMethod(i, { months: Number(e.target.value) })} />
            <button
              type="button"
              aria-label={`Remove ${m.name}`}
              className="min-h-9 rounded-xl border border-slate-200 px-2 text-slate-500 disabled:opacity-40"
              disabled={draft.enrolMethods.length === 1}
              onClick={() => set({ enrolMethods: draft.enrolMethods.filter((_, j) => j !== i) })}
            >
              <Trash size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-2.5 text-xs font-semibold text-slate-600"
          onClick={() => set({ enrolMethods: [...draft.enrolMethods, { name: '', rateTier: 'monthly', months: 1 }] })}
        >
          <Plus size={14} aria-hidden="true" /> Add
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['linkMessage', 'Message with the link ({child} {total} {days} {url})', 3],
            ['discountLine', 'Discount line in the text ({reason} {amount})', 1],
            ['paidMessage', 'Shown to the parent after paying', 3],
            ['terms', 'Terms the parent agrees to', 6],
          ] as const
        ).map(([key, label, rows]) => (
          <div key={key} className={cn(key === 'terms' && 'sm:col-span-2')}>
            <label htmlFor={`qs-${key}`} className="mb-1 block text-xs font-semibold text-slate-600">
              {label}
            </label>
            <textarea id={`qs-${key}`} rows={rows} className={inputClass} value={draft[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<QuotationSettings>)} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-9 items-center rounded-xl bg-[#fc0c97] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
          disabled={state.busy || draft.enrolMethods.some((m) => !m.name.trim())}
          onClick={() => void submit()}
        >
          {state.busy ? 'Saving…' : 'Save quotation settings'}
        </button>
        <button type="button" className="min-h-9 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600" onClick={() => set({ ...DEFAULT_QUOTATION_SETTINGS, enabled: draft.enabled, publicBaseUrl: draft.publicBaseUrl })}>
          Back to the defaults
        </button>
        {state.error && (
          <span role="alert" className="text-sm text-red-700">
            {state.error}
          </span>
        )}
        {state.saved && (
          <span aria-live="polite" className="text-sm text-emerald-700">
            Saved
          </span>
        )}
      </div>
    </section>
  )
}
