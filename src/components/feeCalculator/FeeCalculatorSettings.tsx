import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeSlash, Lock, Plus } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { CycleTier, GlobalRates, InvoiceTemplate, SubjectKind } from '../../lib/feeCalculator/types'
import { DEFAULT_INVOICE_TEMPLATE } from '../../lib/feeCalculator/types'
import { buildCohortRates, quoteFees, type FeeLevel, type FeeRateRow, type FeeTrack } from '../../lib/feeCalculator/quote'
import type { FeeSubjectLevel } from '../../lib/feeCalculator/seed'
import {
  LOCKED_SUBJECT_CODES,
  type FeeCalculatorData,
  type FeeCohort,
  type FeeSubject,
} from '../../lib/feeCalculator/api'
import { Field } from './FeeCalculatorForm'
import { RATE_TIERS } from './labels'
import { QuotationSettingsCard } from '../quotation/QuotationSettingsCard'

// The Price settings tab (the fee_calculator tick with edit): price groups (one per membership level), each group's
// price tables, the school-wide numbers, the subjects and the text lines. Nothing is deleted: groups and subjects are
// hidden. The database checks every save again.

export type FeeSettingsApi = {
  saveCohort: (id: number | null, changes: { name?: string; sortOrder?: number; isActive?: boolean; materialsIncluded?: boolean }) => Promise<string | null>
  saveRates: (cohortId: number, materialsIncluded: boolean, rates: Omit<FeeRateRow, 'cohortId'>[]) => Promise<string | null>
  saveSubject: (
    id: number | null,
    changes: { level?: FeeSubjectLevel; code?: string; label?: string; kind?: SubjectKind; sortOrder?: number; isActive?: boolean },
  ) => Promise<string | null>
  saveGlobalRates: (value: GlobalRates) => Promise<string | null>
  saveTemplate: (value: InvoiceTemplate) => Promise<string | null>
  renameLevel: (name: string, newName: string) => Promise<string | null>
  addLevel: (name: string) => Promise<string | null>
  // Quotations: which of the school's subjects a Fee Calculator subject is (to list its classes). Optional.
  loadClassSubjects?: () => Promise<{ id: number; name: string }[]>
  setClassSubject?: (feeSubjectId: number, subjectId: number | null) => Promise<string | null>
}

const inputClass = 'min-h-9 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800'
const smallButton = 'inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40'
const saveButton = 'inline-flex min-h-9 items-center rounded-xl bg-[#fc0c97] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50'

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>
      {children}
    </section>
  )
}

// A save button with what happened next to it.
function useSaver() {
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false })
  async function run(action: () => Promise<string | null>) {
    setState({ busy: true, error: null, saved: false })
    const error = await action()
    setState({ busy: false, error, saved: !error })
    return !error
  }
  const status = state.error ? (
    <span role="alert" className="text-sm text-red-700">
      {state.error}
    </span>
  ) : state.saved ? (
    <span aria-live="polite" className="text-sm text-emerald-700">
      Saved
    </span>
  ) : null
  return { run, busy: state.busy, status, clear: () => setState({ busy: false, error: null, saved: false }) }
}

export function FeeCalculatorSettings({
  data,
  isAdmin,
  api,
  onChanged,
}: {
  data: FeeCalculatorData
  isAdmin: boolean
  api: FeeSettingsApi
  // Reload after a save.
  onChanged: () => Promise<void>
}) {
  const [openCohortId, setOpenCohortId] = useState<number | null>(null)
  const openCohort = data.cohorts.find((cohort) => cohort.id === openCohortId) ?? null

  return (
    <div className="space-y-5">
      <CohortList data={data} isAdmin={isAdmin} api={api} onChanged={onChanged} openId={openCohortId} onOpen={setOpenCohortId} />
      {openCohort && (
        <RateEditor
          // Starts over for another group or after a reload.
          key={`${openCohort.id}-${data.rates.length}-${openCohort.materialsIncluded}`}
          cohort={openCohort}
          rates={data.rates.filter((rate) => rate.cohortId === openCohort.id)}
          api={api}
          onChanged={onChanged}
          onClose={() => setOpenCohortId(null)}
        />
      )}
      <GlobalRatesForm key={JSON.stringify(data.globalRates)} value={data.globalRates} api={api} onChanged={onChanged} />
      <SubjectsEditor subjects={data.subjects} api={api} onChanged={onChanged} />
      <TemplateForm key={JSON.stringify(data.invoiceTemplate)} data={data} api={api} onChanged={onChanged} />
      {isAdmin && <QuotationSettingsCard />}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Price groups

function CohortList({
  data,
  isAdmin,
  api,
  onChanged,
  openId,
  onOpen,
}: {
  data: FeeCalculatorData
  isAdmin: boolean
  api: FeeSettingsApi
  onChanged: () => Promise<void>
  openId: number | null
  onOpen: (id: number | null) => void
}) {
  const saver = useSaver()
  const taken = new Set(data.cohorts.map((cohort) => cohort.name))
  const free = data.membershipLevels.filter((level) => level.isActive && !taken.has(level.name))
  const [pick, setPick] = useState('')
  const [newLevel, setNewLevel] = useState('')
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const shown = data.cohorts.filter((cohort) => cohort.isActive)

  async function act(action: () => Promise<string | null>) {
    if (await saver.run(action)) await onChanged()
  }

  async function move(cohort: FeeCohort, direction: -1 | 1) {
    const index = shown.findIndex((entry) => entry.id === cohort.id)
    const other = shown[index + direction]
    if (!other) return
    const mine = cohort.sortOrder === other.sortOrder ? cohort.sortOrder + direction : other.sortOrder
    await act(async () => (await api.saveCohort(cohort.id, { sortOrder: mine })) ?? api.saveCohort(other.id, { sortOrder: cohort.sortOrder }))
  }

  async function add() {
    const name = pick === '__new' ? newLevel.trim() : pick
    if (!name) return
    await act(async () => {
      if (pick === '__new') {
        const failure = await api.addLevel(name)
        if (failure) return failure
      }
      return api.saveCohort(null, { name })
    })
    setPick('')
    setNewLevel('')
  }

  return (
    <Card
      title="Price groups"
      note="One group per membership level (the Membership choices in Class Settings > Student fields). Hidden groups keep their prices and leave the calculator."
    >
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {data.cohorts.map((cohort) => (
          <li key={cohort.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', !cohort.isActive && 'bg-slate-50')}>
            {renaming?.id === cohort.id ? (
              <form
                className="flex flex-1 flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const next = renaming.name.trim()
                  if (next && next !== cohort.name) void act(() => api.renameLevel(cohort.name, next)).then(() => setRenaming(null))
                  else setRenaming(null)
                }}
              >
                <label className="sr-only" htmlFor={`rename-${cohort.id}`}>
                  New name
                </label>
                <input id={`rename-${cohort.id}`} className={inputClass} value={renaming.name} onChange={(e) => setRenaming({ id: cohort.id, name: e.target.value })} />
                <button type="submit" className={smallButton}>
                  Save name
                </button>
                <button type="button" className={smallButton} onClick={() => setRenaming(null)}>
                  Cancel
                </button>
                <span className="text-xs text-slate-500">Renames the membership level on every student too.</span>
              </form>
            ) : (
              <>
                <span className={cn('flex-1 text-sm font-semibold', cohort.isActive ? 'text-slate-900' : 'text-slate-400')}>
                  {cohort.name}
                  {cohort.materialsIncluded && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">materials in tuition</span>}
                  {!cohort.isActive && <span className="ml-2 text-xs font-medium">hidden</span>}
                </span>
                <button type="button" className={cn(smallButton, openId === cohort.id && 'border-[#fc0c97] text-[#be185d]')} onClick={() => onOpen(openId === cohort.id ? null : cohort.id)}>
                  {openId === cohort.id ? 'Close prices' : 'Edit prices'}
                </button>
                {cohort.isActive && (
                  <>
                    <button type="button" aria-label={`Move ${cohort.name} up`} className={smallButton} disabled={saver.busy || shown[0]?.id === cohort.id} onClick={() => void move(cohort, -1)}>
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button type="button" aria-label={`Move ${cohort.name} down`} className={smallButton} disabled={saver.busy || shown[shown.length - 1]?.id === cohort.id} onClick={() => void move(cohort, 1)}>
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                  </>
                )}
                {isAdmin && (
                  <button type="button" aria-label={`Rename ${cohort.name}`} className={smallButton} onClick={() => setRenaming({ id: cohort.id, name: cohort.name })}>
                    Rename
                  </button>
                )}
                <button type="button" className={smallButton} disabled={saver.busy} onClick={() => void act(() => api.saveCohort(cohort.id, { isActive: !cohort.isActive }))}>
                  {cohort.isActive ? <EyeSlash size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  {cohort.isActive ? 'Hide' : 'Show'}
                </button>
              </>
            )}
          </li>
        ))}
        {data.cohorts.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No price group yet.</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Add a group for" htmlFor="fee-add-group">
          <select id="fee-add-group" className={inputClass} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Pick a membership level</option>
            {free.map((level) => (
              <option key={level.name} value={level.name}>
                {level.name}
              </option>
            ))}
            {isAdmin && <option value="__new">New membership level…</option>}
          </select>
        </Field>
        {pick === '__new' && (
          <Field label="New membership level" htmlFor="fee-new-level">
            <input id="fee-new-level" className={inputClass} value={newLevel} onChange={(e) => setNewLevel(e.target.value)} placeholder="e.g. 26003" />
          </Field>
        )}
        <button type="button" className={saveButton} disabled={saver.busy || !pick || (pick === '__new' && !newLevel.trim())} onClick={() => void add()}>
          <Plus size={14} aria-hidden="true" className="mr-1" />
          Add group
        </button>
      </div>
      {!isAdmin && free.length === 0 && <p className="text-xs text-slate-500">Every membership level has a group. An admin adds new levels.</p>}
      {saver.status}
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// One group's price tables

type TableSpec = { level: FeeLevel; track: FeeTrack; title: string; optional: boolean; fixedCounts?: number[]; maxCount: number }

const TABLES: TableSpec[] = [
  { level: 'primary', track: 'standard', title: 'Primary', optional: false, maxCount: 30 },
  { level: 'secondary', track: 'standard', title: 'Secondary', optional: false, maxCount: 30 },
  { level: 'secondary', track: 'bio_che_phy', title: 'Secondary BIO / CHE / PHY', optional: true, maxCount: 3 },
  { level: 'primary', track: 'sejarah_standalone', title: 'Primary Sejarah on its own', optional: true, fixedCounts: [1], maxCount: 1 },
  { level: 'primary', track: 'cambridge_english', title: 'Primary Cambridge English (BIP / BIK) on its own', optional: true, maxCount: 2 },
  { level: 'secondary', track: 'cambridge_english', title: 'Secondary Cambridge English (BIP / BIK) on its own', optional: true, maxCount: 2 },
]

type DraftTable = { on: boolean; rows: { count: number; values: Record<CycleTier, string> }[] }
const tableKey = (spec: TableSpec) => `${spec.level}|${spec.track}`

function draftFrom(rates: FeeRateRow[]): Record<string, DraftTable> {
  const draft: Record<string, DraftTable> = {}
  for (const spec of TABLES) {
    const mine = rates.filter((rate) => rate.level === spec.level && rate.track === spec.track)
    const counts = [...new Set(mine.map((rate) => rate.subjectCount))].sort((a, b) => a - b)
    draft[tableKey(spec)] = {
      on: !spec.optional || mine.length > 0,
      rows: counts.map((count) => ({
        count,
        values: Object.fromEntries(
          RATE_TIERS.map((tier) => {
            const rate = mine.find((r) => r.subjectCount === count && r.cycleTier === tier.key)
            return [tier.key, rate ? String(rate.amount) : '']
          }),
        ) as Record<CycleTier, string>,
      })),
    }
    if (draft[tableKey(spec)].on && draft[tableKey(spec)].rows.length === 0 && spec.fixedCounts) {
      draft[tableKey(spec)].rows = spec.fixedCounts.map((count) => ({ count, values: { monthly: '', '3mo': '', '6mo_plus': '' } }))
    }
  }
  return draft
}

function RateEditor({
  cohort,
  rates,
  api,
  onChanged,
  onClose,
}: {
  cohort: FeeCohort
  rates: FeeRateRow[]
  api: FeeSettingsApi
  onChanged: () => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(() => draftFrom(rates))
  const [materialsIncluded, setMaterialsIncluded] = useState(cohort.materialsIncluded)
  const [dirty, setDirty] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const saver = useSaver()

  function change(key: string, next: DraftTable) {
    setDraft((current) => ({ ...current, [key]: next }))
    setDirty(true)
    saver.clear()
  }

  async function save() {
    const out: Omit<FeeRateRow, 'cohortId'>[] = []
    for (const spec of TABLES) {
      const table = draft[tableKey(spec)]
      if (!table.on) continue
      for (const row of table.rows) {
        for (const tier of RATE_TIERS) {
          const text = row.values[tier.key].trim()
          const amount = Number(text)
          if (text === '' || !Number.isFinite(amount) || amount < 0) {
            setProblem(`${spec.title}, ${row.count} subject${row.count === 1 ? '' : 's'}, ${tier.label}: fill in a price of 0 or more.`)
            return
          }
          out.push({ level: spec.level, track: spec.track, subjectCount: row.count, cycleTier: tier.key, amount })
        }
      }
    }
    setProblem(null)
    if (await saver.run(() => api.saveRates(cohort.id, materialsIncluded, out))) {
      setDirty(false)
      await onChanged()
    }
  }

  return (
    <Card title={`Prices of ${cohort.name}`} note="Price per month (RM) for the number of subjects, in each price column. A number of subjects that is not in a table cannot be worked out.">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={materialsIncluded}
          onChange={(e) => {
            setMaterialsIncluded(e.target.checked)
            setDirty(true)
          }}
        />
        Tuition already includes the materials fee (like 26002: &quot;next month&quot; takes the materials off when they were paid ahead)
      </label>
      {TABLES.map((spec) => {
        const key = tableKey(spec)
        const table = draft[key]
        const nextCount = (table.rows[table.rows.length - 1]?.count ?? 0) + 1
        return (
          <div key={key} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{spec.title}</h3>
              {spec.optional && (
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={table.on}
                    onChange={(e) =>
                      change(key, {
                        on: e.target.checked,
                        rows:
                          e.target.checked && table.rows.length === 0
                            ? (spec.fixedCounts ?? [1]).map((count) => ({ count, values: { monthly: '', '3mo': '', '6mo_plus': '' } }))
                            : table.rows,
                      })
                    }
                  />
                  This group has this table
                </label>
              )}
            </div>
            {table.on && (
              <div className="overflow-x-auto">
                <table className="min-w-[28rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="py-1 pr-3 font-semibold">{spec.track === 'sejarah_standalone' ? '' : 'Subjects'}</th>
                      {RATE_TIERS.map((tier) => (
                        <th key={tier.key} className="py-1 pr-3 font-semibold">
                          {tier.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={row.count}>
                        <td className="py-1 pr-3 font-semibold text-slate-700">{spec.track === 'sejarah_standalone' ? 'Sejarah' : row.count}</td>
                        {RATE_TIERS.map((tier) => (
                          <td key={tier.key} className="py-1 pr-3">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              aria-label={`${spec.title}, ${row.count} subjects, ${tier.label}`}
                              className={cn(inputClass, 'w-24 tabular-nums', row.values[tier.key].trim() === '' && 'border-amber-300')}
                              value={row.values[tier.key]}
                              onChange={(e) => {
                                const rows = table.rows.map((r, i) => (i === rowIndex ? { ...r, values: { ...r.values, [tier.key]: e.target.value } } : r))
                                change(key, { ...table, rows })
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {table.on && !spec.fixedCounts && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className={smallButton}
                  disabled={nextCount > spec.maxCount}
                  onClick={() => change(key, { ...table, rows: [...table.rows, { count: nextCount, values: { monthly: '', '3mo': '', '6mo_plus': '' } }] })}
                >
                  <Plus size={14} aria-hidden="true" /> Add {nextCount} subjects
                </button>
                <button type="button" className={smallButton} disabled={table.rows.length === 0} onClick={() => change(key, { ...table, rows: table.rows.slice(0, -1) })}>
                  Remove the last row
                </button>
              </div>
            )}
          </div>
        )
      })}
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={saveButton} disabled={saver.busy || !dirty} onClick={() => void save()}>
          {saver.busy ? 'Saving…' : `Save prices of ${cohort.name}`}
        </button>
        <button type="button" className={smallButton} onClick={onClose}>
          Close
        </button>
        {dirty && !saver.busy && <span className="text-xs text-amber-700">Not saved yet</span>}
        {saver.status}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// School-wide numbers

const BANDS: { key: '1_2' | '3_4' | '5_plus'; label: string }[] = [
  { key: '1_2', label: '1–2 subjects' },
  { key: '3_4', label: '3–4 subjects' },
  { key: '5_plus', label: '5 or more' },
]

function GlobalRatesForm({ value, api, onChanged }: { value: GlobalRates; api: FeeSettingsApi; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(value)) as GlobalRates)
  const saver = useSaver()
  const num = (text: string) => (text === '' ? Number.NaN : Number(text))
  const numberInput = (id: string, label: string, current: number, onChange: (next: number) => void) => (
    <input
      id={id}
      aria-label={label}
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      className={cn(inputClass, 'w-24 tabular-nums')}
      value={Number.isNaN(current) ? '' : current}
      onChange={(e) => {
        onChange(num(e.target.value))
        saver.clear()
      }}
    />
  )
  const values = [
    draft.materialsFeePerSubjectPerMonth,
    draft.registrationFeeAmount,
    draft.sejSurchargePerMonth,
    draft.postage.west,
    ...BANDS.flatMap((band) => [draft.postage.east[band.key]['1_2'], draft.postage.east[band.key]['3']]),
  ]
  const valid = values.every((n) => Number.isFinite(n) && n >= 0)
  const setEast = (band: '1_2' | '3_4' | '5_plus', months: '1_2' | '3', next: number) =>
    setDraft((d) => ({ ...d, postage: { ...d.postage, east: { ...d.postage.east, [band]: { ...d.postage.east[band], [months]: next } } } }))

  return (
    <Card title="School-wide numbers" note="The same for every price group (RM).">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Materials fee per subject per month" htmlFor="fee-materials">
          {numberInput('fee-materials', 'Materials fee per subject per month', draft.materialsFeePerSubjectPerMonth, (n) => setDraft((d) => ({ ...d, materialsFeePerSubjectPerMonth: n })))}
        </Field>
        <Field label="West Malaysia postage per parcel" htmlFor="fee-west">
          {numberInput('fee-west', 'West Malaysia postage per parcel', draft.postage.west, (n) => setDraft((d) => ({ ...d, postage: { ...d.postage, west: n } })))}
        </Field>
        <Field label="Yearly registration fee" htmlFor="fee-registration">
          {numberInput('fee-registration', 'Yearly registration fee', draft.registrationFeeAmount, (n) => setDraft((d) => ({ ...d, registrationFeeAmount: n })))}
        </Field>
        <Field label="Secondary SEJ extra per month" htmlFor="fee-sej">
          {numberInput('fee-sej', 'Secondary SEJ extra per month', draft.sejSurchargePerMonth, (n) => setDraft((d) => ({ ...d, sejSurchargePerMonth: n })))}
        </Field>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <caption className="pb-1 text-left text-xs font-semibold text-slate-600">East Malaysia postage per parcel</caption>
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-semibold">All subjects</th>
              <th className="py-1 pr-3 font-semibold">Parcel of 1–2 months</th>
              <th className="py-1 pr-3 font-semibold">Parcel of 3 months</th>
            </tr>
          </thead>
          <tbody>
            {BANDS.map((band) => (
              <tr key={band.key}>
                <td className="py-1 pr-3 font-semibold text-slate-700">{band.label}</td>
                <td className="py-1 pr-3">{numberInput(`east-${band.key}-12`, `East Malaysia, ${band.label}, 1–2 months`, draft.postage.east[band.key]['1_2'], (n) => setEast(band.key, '1_2', n))}</td>
                <td className="py-1 pr-3">{numberInput(`east-${band.key}-3`, `East Malaysia, ${band.label}, 3 months`, draft.postage.east[band.key]['3'], (n) => setEast(band.key, '3', n))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={saveButton}
          disabled={saver.busy || !valid}
          onClick={() => void saver.run(() => api.saveGlobalRates(draft)).then((ok) => (ok ? onChanged() : undefined))}
        >
          {saver.busy ? 'Saving…' : 'Save numbers'}
        </button>
        {!valid && <span className="text-sm text-amber-700">Every number must be 0 or more.</span>}
        {saver.status}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Subjects

const SUBJECT_LISTS: { level: FeeSubjectLevel; title: string }[] = [
  { level: 'primary', title: 'Primary' },
  { level: 'secondary', title: 'Secondary' },
  { level: 'bio_che_phy', title: 'Secondary BIO / CHE / PHY (own price table)' },
]

const KIND_LABELS: Record<SubjectKind, string> = { core: 'Normal subject', sej: 'Sejarah', bip: 'English Reading', bik: 'English Writing' }

function SubjectsEditor({ subjects, api, onChanged }: { subjects: FeeSubject[]; api: FeeSettingsApi; onChanged: () => Promise<void> }) {
  const saver = useSaver()
  const [adding, setAdding] = useState<{ level: FeeSubjectLevel; code: string; label: string } | null>(null)
  const [editing, setEditing] = useState<{ id: number; code: string; label: string } | null>(null)
  const [classSubjects, setClassSubjects] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    if (!api.loadClassSubjects) return
    let alive = true
    void api.loadClassSubjects().then((list) => alive && setClassSubjects(list))
    return () => {
      alive = false
    }
  }, [api])

  async function act(action: () => Promise<string | null>) {
    const ok = await saver.run(action)
    if (ok) await onChanged()
    return ok
  }

  async function move(list: FeeSubject[], subject: FeeSubject, direction: -1 | 1) {
    const shown = list.filter((s) => s.isActive)
    const index = shown.findIndex((s) => s.id === subject.id)
    const other = shown[index + direction]
    if (!other) return
    const mine = subject.sortOrder === other.sortOrder ? subject.sortOrder + direction : other.sortOrder
    await act(async () => (await api.saveSubject(subject.id, { sortOrder: mine })) ?? api.saveSubject(other.id, { sortOrder: subject.sortOrder }))
  }

  return (
    <Card
      title="Subjects"
      note="What consultants tick. The code goes into the text for the parent (e.g. BMP+MM). SEJ, BIP and BIK keep their codes: the calculator finds them by code. Hidden subjects leave the calculator."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {SUBJECT_LISTS.map((list) => {
          const mine = subjects.filter((s) => s.level === list.level)
          const shown = mine.filter((s) => s.isActive)
          return (
            <div key={list.level} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">{list.title}</h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {mine.map((subject) => {
                  const locked = LOCKED_SUBJECT_CODES.includes(subject.code)
                  return (
                    <li key={subject.id} className={cn('space-y-1 px-3 py-2', !subject.isActive && 'bg-slate-50')}>
                      {editing?.id === subject.id ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void act(() => api.saveSubject(subject.id, { code: locked ? undefined : editing.code, label: editing.label })).then((ok) => ok && setEditing(null))
                          }}
                        >
                          <input
                            aria-label="Code"
                            className={cn(inputClass, 'w-20 uppercase')}
                            value={editing.code}
                            disabled={locked}
                            onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                          />
                          <input aria-label="Name" className={cn(inputClass, 'min-w-0 flex-1')} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                          <button type="submit" className={smallButton}>
                            Save
                          </button>
                          <button type="button" className={smallButton} onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={cn('w-12 shrink-0 text-xs font-bold', subject.isActive ? 'text-slate-900' : 'text-slate-400')}>{subject.code}</span>
                          <span className={cn('min-w-0 flex-1 truncate text-sm', subject.isActive ? 'text-slate-700' : 'text-slate-400')} title={subject.label}>
                            {subject.label}
                          </span>
                          {locked && <Lock size={14} className="shrink-0 text-slate-400" aria-label="Code and kind are fixed" />}
                        </div>
                      )}
                      {editing?.id !== subject.id && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {subject.kind !== 'core' && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{KIND_LABELS[subject.kind]}</span>
                          )}
                          {classSubjects.length > 0 && api.setClassSubject && (
                            <select
                              aria-label={`Class subject of ${subject.code}`}
                              title="Its classes in a quotation"
                              className={cn(inputClass, 'min-h-8 max-w-[9rem] py-1 text-xs')}
                              value={subject.subjectId ?? ''}
                              disabled={saver.busy}
                              onChange={(e) => void act(() => api.setClassSubject!(subject.id, e.target.value ? Number(e.target.value) : null))}
                            >
                              <option value="">Classes: any subject</option>
                              {classSubjects.map((c) => (
                                <option key={c.id} value={c.id}>
                                  Classes: {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button type="button" className={smallButton} onClick={() => setEditing({ id: subject.id, code: subject.code, label: subject.label })}>
                            Rename
                          </button>
                          {subject.isActive && (
                            <>
                              <button type="button" aria-label={`Move ${subject.code} up`} className={smallButton} disabled={saver.busy || shown[0]?.id === subject.id} onClick={() => void move(mine, subject, -1)}>
                                <ArrowUp size={14} aria-hidden="true" />
                              </button>
                              <button type="button" aria-label={`Move ${subject.code} down`} className={smallButton} disabled={saver.busy || shown[shown.length - 1]?.id === subject.id} onClick={() => void move(mine, subject, 1)}>
                                <ArrowDown size={14} aria-hidden="true" />
                              </button>
                            </>
                          )}
                          <button type="button" className={smallButton} disabled={saver.busy} onClick={() => void act(() => api.saveSubject(subject.id, { isActive: !subject.isActive }))}>
                            {subject.isActive ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {adding?.level === list.level ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void act(() => api.saveSubject(null, { level: list.level, code: adding.code, label: adding.label, kind: 'core' })).then((ok) => ok && setAdding(null))
                  }}
                >
                  <input aria-label="New subject code" placeholder="Code" className={cn(inputClass, 'w-20 uppercase')} value={adding.code} onChange={(e) => setAdding({ ...adding, code: e.target.value.toUpperCase() })} />
                  <input aria-label="New subject name" placeholder="Name" className={cn(inputClass, 'min-w-0 flex-1')} value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} />
                  <button type="submit" className={smallButton} disabled={!adding.code.trim() || !adding.label.trim()}>
                    Add
                  </button>
                  <button type="button" className={smallButton} onClick={() => setAdding(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button type="button" className={smallButton} onClick={() => setAdding({ level: list.level, code: '', label: '' })}>
                  <Plus size={14} aria-hidden="true" /> Add subject
                </button>
              )}
            </div>
          )
        })}
      </div>
      {saver.status}
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Text lines

const TEMPLATE_LINES: { key: keyof InvoiceTemplate; label: string; tokens: string }[] = [
  { key: 'tuitionSingleMonth', label: 'Tuition, one month', tokens: '{amount}' },
  { key: 'tuitionMultiMonth', label: 'Tuition, several months', tokens: '{perMonth} {months} {total}' },
  { key: 'materialsLine', label: 'Materials fee', tokens: '{monthsLabel} {amount}' },
  { key: 'postageLine', label: 'Postage', tokens: '{region} {amount}' },
  { key: 'registrationLine', label: 'Registration fee', tokens: '{amount}' },
  { key: 'totalLine', label: 'Total', tokens: '{total}' },
  { key: 'nextMonthLine', label: 'Next month', tokens: '{amount}' },
  { key: 'nextMonthReason', label: 'Why next month is less', tokens: '{items}' },
]

function TemplateForm({ data, api, onChanged }: { data: FeeCalculatorData; api: FeeSettingsApi; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState<InvoiceTemplate>(data.invoiceTemplate)
  const saver = useSaver()

  // A sample with the first shown group: primary, West Malaysia, this month, the first three subjects, registration.
  const preview = useMemo(() => {
    const cohort = data.cohorts.find((c) => c.isActive)
    if (!cohort) return ''
    const subjectList = data.subjects.filter((s) => s.level === 'primary' && s.isActive).map((s) => ({ id: s.code, label: s.label, kind: s.kind }))
    const now = new Date()
    return quoteFees({
      cohort: {
        key: String(cohort.id),
        label: cohort.name,
        primary: buildCohortRates(data.rates, cohort.id, 'primary'),
        secondary: buildCohortRates(data.rates, cohort.id, 'secondary'),
        materialsIncludedInTuition: cohort.materialsIncluded,
      },
      level: 'primary',
      region: 'west_malaysia',
      rateTier: 'monthly',
      startYear: now.getFullYear(),
      startMonth: now.getMonth() + 1,
      endYear: now.getFullYear(),
      endMonth: now.getMonth() + 1,
      subjectList,
      selectedSubjects: subjectList.filter((s) => s.kind === 'core').slice(0, 3).map((s) => s.id),
      selectedBioChePhy: [],
      anniversaryMonth: now.getMonth() + 1,
      globalRates: data.globalRates,
      invoiceTemplate: draft,
    }).invoiceText
  }, [data, draft])

  return (
    <Card title="Text for the parent" note="Each line of the text. The words in { } are filled in by the calculator.">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {TEMPLATE_LINES.map((line) => (
            <Field key={line.key} label={line.label} htmlFor={`fee-template-${line.key}`} hint={`Fills in: ${line.tokens}`}>
              <input
                id={`fee-template-${line.key}`}
                className={cn(inputClass, 'w-full')}
                maxLength={200}
                value={draft[line.key]}
                onChange={(e) => {
                  setDraft({ ...draft, [line.key]: e.target.value })
                  saver.clear()
                }}
              />
            </Field>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={saveButton}
              disabled={saver.busy}
              onClick={() => void saver.run(() => api.saveTemplate(draft)).then((ok) => (ok ? onChanged() : undefined))}
            >
              {saver.busy ? 'Saving…' : 'Save text'}
            </button>
            <button type="button" className={smallButton} onClick={() => setDraft(DEFAULT_INVOICE_TEMPLATE)}>
              Back to EC&apos;s wording
            </button>
            {saver.status}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-600">Preview (a sample)</div>
          <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">{preview || 'Add a price group to see a sample.'}</pre>
        </div>
      </div>
    </Card>
  )
}
