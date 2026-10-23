import { useMemo, useState, type ReactNode } from 'react'
import { Check, Copy } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { CohortEntry, CycleTier, GlobalRates, InvoiceTemplate, Region, SubjectOption } from '../../lib/feeCalculator/types'
import { MONTH_NAMES, RATE_TIERS } from './labels'
import { autoTierForMonths, endMonthForTier, openingMonth, quoteFees, yearOptions, type FeeLevel } from '../../lib/feeCalculator/quote'

// The Fee Calculator tab: a consultant picks the price group, level, region, months and subjects, and gets EC's sum
// and the text to send the parent. The page only collects the choices; quoteFees does the maths.

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-600">
          {label}
        </label>
      ) : (
        <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-9 rounded-xl px-3 py-1.5 text-sm font-semibold transition',
        active ? 'bg-[#fc0c97] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}

const selectClass = 'min-h-9 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800'

export function FeeCalculatorForm({
  cohorts,
  globalRates,
  primarySubjects,
  secondarySubjects,
  bioChePhySubjects,
  invoiceTemplate,
  today = new Date(),
}: {
  cohorts: CohortEntry[]
  globalRates: GlobalRates
  primarySubjects: SubjectOption[]
  secondarySubjects: SubjectOption[]
  bioChePhySubjects: SubjectOption[]
  invoiceTemplate: InvoiceTemplate
  today?: Date
}) {
  const opening = openingMonth(today)
  const [cohortKey, setCohortKey] = useState(cohorts[0]?.key ?? '')
  const [level, setLevel] = useState<FeeLevel>('primary')
  const [region, setRegion] = useState<Region>('west_malaysia')
  const [rateTier, setRateTier] = useState<CycleTier>('monthly')
  const [startYear, setStartYear] = useState(opening.year)
  const [startMonth, setStartMonth] = useState(opening.month)
  const [endYear, setEndYear] = useState(opening.year)
  const [endMonth, setEndMonth] = useState(opening.month)
  const [primarySelected, setPrimarySelected] = useState<string[]>([])
  const [secondarySelected, setSecondarySelected] = useState<string[]>([])
  const [bioChePhySelected, setBioChePhySelected] = useState<string[]>([])
  const [chargeRegistration, setChargeRegistration] = useState(false)
  const [anniversaryMonth, setAnniversaryMonth] = useState(1)
  const [copied, setCopied] = useState(false)

  const cohort = cohorts.find((c) => c.key === cohortKey) ?? cohorts[0] ?? null
  const subjectList = level === 'primary' ? primarySubjects : secondarySubjects
  const selectedSubjects = level === 'primary' ? primarySelected : secondarySelected
  const setSelectedSubjects = level === 'primary' ? setPrimarySelected : setSecondarySelected

  // Last year to next year (boss 2026-10-22), plus a year the end month moved to.
  const years = [...new Set([...yearOptions(today), startYear, endYear])].sort((a, b) => a - b)

  function applyDateChange(newStartYear: number, newStartMonth: number, newEndYear: number, newEndMonth: number) {
    setStartYear(newStartYear)
    setStartMonth(newStartMonth)
    setEndYear(newEndYear)
    setEndMonth(newEndMonth)
    const tier = autoTierForMonths(newStartYear, newStartMonth, newEndYear, newEndMonth)
    if (tier) setRateTier(tier)
  }

  function applyTierChange(newTier: CycleTier) {
    setRateTier(newTier)
    const end = endMonthForTier(newTier, startYear, startMonth)
    setEndYear(end.year)
    setEndMonth(end.month)
  }

  const quote = useMemo(
    () =>
      quoteFees({
        cohort,
        level,
        region,
        rateTier,
        startYear,
        startMonth,
        endYear,
        endMonth,
        subjectList,
        selectedSubjects,
        selectedBioChePhy: bioChePhySelected,
        anniversaryMonth: chargeRegistration ? anniversaryMonth : null,
        globalRates,
        invoiceTemplate,
      }),
    [cohort, level, region, rateTier, startYear, startMonth, endYear, endMonth, subjectList, selectedSubjects, bioChePhySelected, chargeRegistration, anniversaryMonth, globalRates, invoiceTemplate],
  )
  const { sejarahAvailable, cambridgeAvailable, bioChePhyAvailable } = quote.counts

  async function copy() {
    try {
      await navigator.clipboard.writeText(quote.invoiceText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  if (cohorts.length === 0) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        No price group yet. Someone who may change the Fee Calculator adds one on the Price settings tab.
      </p>
    )
  }

  const monthPicker = (id: string, year: number, month: number, onChange: (year: number, month: number) => void) => (
    <div className="flex gap-2">
      <select aria-label={`${id === 'fee-start' ? 'Start' : 'End'} year`} className={selectClass} value={year} onChange={(e) => onChange(Number(e.target.value), month)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select aria-label={`${id === 'fee-start' ? 'Start' : 'End'} month`} className={selectClass} value={month} onChange={(e) => onChange(year, Number(e.target.value))}>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-label="Choices" className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="rounded-xl bg-[#fff1f8] px-3 py-2 text-xs text-slate-700">
          The price column only picks which price is used. How many months are charged comes from the start and end month.
          Picking the months picks the column for you; you can still change it.
        </p>
        <Field label="Price group (membership)" htmlFor="fee-cohort">
          <select id="fee-cohort" className={cn(selectClass, 'w-full')} value={cohort?.key ?? ''} onChange={(e) => setCohortKey(e.target.value)}>
            {cohorts.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Level">
          <div className="flex gap-2">
            <Choice active={level === 'primary'} onClick={() => setLevel('primary')}>
              Primary
            </Choice>
            <Choice active={level === 'secondary'} onClick={() => setLevel('secondary')}>
              Secondary
            </Choice>
          </div>
        </Field>
        <Field label="Region">
          <div className="flex gap-2">
            <Choice active={region === 'west_malaysia'} onClick={() => setRegion('west_malaysia')}>
              West Malaysia
            </Choice>
            <Choice active={region === 'east_malaysia'} onClick={() => setRegion('east_malaysia')}>
              East Malaysia
            </Choice>
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start month">
            {monthPicker('fee-start', startYear, startMonth, (y, m) => applyDateChange(y, m, endYear, endMonth))}
          </Field>
          <Field label="End month (included)">
            {monthPicker('fee-end', endYear, endMonth, (y, m) => applyDateChange(startYear, startMonth, y, m))}
          </Field>
        </div>
        <Field label="Price column">
          <div className="flex flex-wrap gap-2">
            {RATE_TIERS.map((tier) => (
              <Choice key={tier.key} active={rateTier === tier.key} onClick={() => applyTierChange(tier.key)}>
                {tier.label}
              </Choice>
            ))}
          </div>
        </Field>
        <Field label="Subjects">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {subjectList.map((s) => (
              <label key={s.id} className="flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={selectedSubjects.includes(s.id)} onChange={() => setSelectedSubjects(toggle(selectedSubjects, s.id))} />
                <span className="flex-1">{s.label}</span>
                {s.kind === 'sej' && sejarahAvailable && <span className="text-xs text-slate-400">own price</span>}
                {(s.kind === 'bip' || s.kind === 'bik') && cambridgeAvailable && <span className="text-xs text-slate-400">own price</span>}
              </label>
            ))}
            {bioChePhyAvailable &&
              bioChePhySubjects.map((s) => (
                <label key={s.id} className="flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700">
                  <input type="checkbox" checked={bioChePhySelected.includes(s.id)} onChange={() => setBioChePhySelected(toggle(bioChePhySelected, s.id))} />
                  <span className="flex-1">{s.label}</span>
                  <span className="text-xs text-slate-400">own price</span>
                </label>
              ))}
          </div>
        </Field>
        <Field label="Registration fee">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={chargeRegistration} onChange={(e) => setChargeRegistration(e.target.checked)} />
            Charge the yearly registration fee this time
          </label>
          {chargeRegistration && (
            <select aria-label="Registration month" className={cn(selectClass, 'mt-2')} value={anniversaryMonth} onChange={(e) => setAnniversaryMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  Registration month: {name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </section>

      <section aria-label="Result" className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">This time</h2>
        {quote.error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {quote.error}
          </div>
        )}
        {quote.result && (
          <>
            <ul className="divide-y divide-slate-100">
              {quote.result.lines.map((line, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <span className="text-slate-600">{line.description}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">RM{line.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
              <span className="text-base font-semibold text-[#be185d]">Total to collect</span>
              <span className="text-2xl font-bold tabular-nums text-[#be185d]" data-testid="fee-total">
                RM{quote.result.total.toFixed(2)}
              </span>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Text for the parent</h3>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#de0a84]"
                >
                  {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <span className="sr-only" aria-live="polite">
                {copied ? 'Copied to the clipboard' : ''}
              </span>
              <pre data-testid="fee-invoice-text" className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">
                {quote.invoiceText}
              </pre>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
