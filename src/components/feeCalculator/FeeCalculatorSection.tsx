import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import {
  addMembershipLevel,
  cohortEntries,
  fetchClassSubjects,
  fetchFeeCalculatorData,
  setFeeSubjectClassSubject,
  renameMembershipLevel,
  saveFeeCohort,
  saveFeeCohortRates,
  saveFeeSettings,
  saveFeeSubject,
  subjectOptions,
  type FeeCalculatorData,
} from '../../lib/feeCalculator/api'
import { FeeCalculatorForm } from './FeeCalculatorForm'
import { FeeCalculatorSettings, type FeeSettingsApi } from './FeeCalculatorSettings'

const databaseApi: FeeSettingsApi = {
  saveCohort: saveFeeCohort,
  saveRates: saveFeeCohortRates,
  saveSubject: saveFeeSubject,
  saveGlobalRates: (value) => saveFeeSettings('global_rates', value),
  saveTemplate: (value) => saveFeeSettings('invoice_template', value),
  renameLevel: renameMembershipLevel,
  addLevel: addMembershipLevel,
  loadClassSubjects: fetchClassSubjects,
  setClassSubject: setFeeSubjectClassSubject,
}

// The Fee Calculator page (Students menu), shown when the school switched it on and the person has the
// fee_calculator tick: the calculator, and for the edit tick the Price settings.
export function FeeCalculatorSection({
  canEdit,
  isAdmin,
  load = fetchFeeCalculatorData,
  api = databaseApi,
}: {
  canEdit: boolean
  isAdmin: boolean
  load?: () => Promise<FeeCalculatorData | null>
  api?: FeeSettingsApi
}) {
  const [data, setData] = useState<FeeCalculatorData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [tab, setTab] = useState<'calculator' | 'settings'>('calculator')

  const reload = useCallback(async () => {
    const next = await load()
    setData(next)
    setState(next ? 'ready' : 'missing')
  }, [load])

  useEffect(() => {
    let alive = true
    void load().then((next) => {
      if (!alive) return
      setData(next)
      setState(next ? 'ready' : 'missing')
    })
    return () => {
      alive = false
    }
  }, [load])

  if (state === 'loading') {
    return <p className="text-sm text-slate-500" aria-busy="true">Loading the prices…</p>
  }
  if (!data) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        The Fee Calculator&apos;s prices could not be read. It needs its database update first.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <div role="tablist" aria-label="Fee Calculator" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ['calculator', 'Calculator'],
              ['settings', 'Price settings'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn('min-h-9 rounded-lg px-4 py-1.5 text-sm font-semibold transition', tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'settings' && canEdit ? (
        <FeeCalculatorSettings data={data} isAdmin={isAdmin} api={api} onChanged={reload} />
      ) : (
        <FeeCalculatorForm
          // Starts over when the prices change.
          key={`${data.cohorts.map((c) => `${c.id}${c.isActive}`).join()}`}
          cohorts={cohortEntries(data)}
          globalRates={data.globalRates}
          primarySubjects={subjectOptions(data, 'primary')}
          secondarySubjects={subjectOptions(data, 'secondary')}
          bioChePhySubjects={subjectOptions(data, 'bio_che_phy')}
          invoiceTemplate={data.invoiceTemplate}
        />
      )}
    </div>
  )
}
