import { useEffect, useState } from 'react'
import { formatDate } from '../domain/studentStatus'
import {
  addMonthPlan,
  fetchMonthPlans,
  hideMonthPlan,
  latestPlanByClass,
  monthPlanEndDate,
  type MonthPlan,
} from '../lib/studentExtras'

// Student profile, at a school that charges by the month: for each class
// (subject) the child studies, the months paid. Each class keeps its own first
// day, months and last day. Shows nothing before the database update.
export function MonthPlansCard({
  studentId,
  classes,
  canEdit,
  todayString,
}: {
  studentId: number
  // The student's classes now, main class first.
  classes: { id: number; name: string }[]
  canEdit: boolean
  todayString: string
}) {
  const [plans, setPlans] = useState<MonthPlan[] | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [classroomId, setClassroomId] = useState<number | null>(classes[0]?.id ?? null)
  const [startDate, setStartDate] = useState(todayString)
  const [months, setMonths] = useState('1')
  const [remark, setRemark] = useState('')

  async function load() {
    try {
      setPlans(await fetchMonthPlans(studentId))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the months.')
      setPlans([])
    }
  }

  useEffect(() => {
    void load()
    // Loads again only for another student.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  // Before the database update there is nothing to show.
  if (plans === null || plans === undefined) return null

  const latest = latestPlanByClass(plans)
  const knownIds = new Set(classes.map((entry) => entry.id))
  // A class the student has left still shows its months.
  const shownClasses = [
    ...classes,
    ...[...latest.keys()].filter((id) => !knownIds.has(id)).map((id) => ({ id, name: 'A class the student left' })),
  ]
  const monthCount = Number(months)
  const validMonths = Number.isInteger(monthCount) && monthCount >= 1 && monthCount <= 60
  const endPreview = startDate && validMonths ? monthPlanEndDate(startDate, monthCount) : null

  function startAdding(forClass: number | null) {
    const current = forClass !== null ? latest.get(forClass) : undefined
    setClassroomId(forClass)
    // A renewal starts the day after the months now paid end.
    setStartDate(current ? addOneDay(current.endDate) : todayString)
    setMonths('1')
    setRemark('')
    setError(null)
    setIsAdding(true)
  }

  async function save() {
    if (classroomId === null || !startDate || !validMonths) return
    setIsSaving(true)
    const failure = await addMonthPlan({ studentId, classroomId, startDate, months: monthCount, remark })
    setIsSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    setIsAdding(false)
    await load()
  }

  async function remove(plan: MonthPlan) {
    const failure = await hideMonthPlan(plan.id)
    if (failure) {
      setError(failure)
      return
    }
    await load()
  }

  const input = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Months per subject</h3>
        {canEdit && !isAdding && classes.length > 0 && (
          <button
            type="button"
            onClick={() => startAdding(classes[0].id)}
            className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Add months
          </button>
        )}
      </div>

      {shownClasses.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Not in a class yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {shownClasses.map((entry) => {
            const plan = latest.get(entry.id)
            const ended = plan ? plan.endDate < todayString : false
            const history = plans.filter((item) => item.classroomId === entry.id && item.id !== plan?.id)
            return (
              <li key={entry.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{entry.name}</span>
                  {plan ? (
                    <span className={ended ? 'font-semibold text-red-600' : 'text-slate-700'}>
                      {formatDate(plan.startDate)} – {formatDate(plan.endDate)} · {plan.months}{' '}
                      {plan.months === 1 ? 'month' : 'months'}
                      {ended ? ' · ended' : ''}
                    </span>
                  ) : (
                    <span className="text-slate-400">No months yet</span>
                  )}
                </div>
                {(plan?.remark || history.length > 0 || (canEdit && plan)) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {plan?.remark && <span>{plan.remark}</span>}
                    {history.length > 0 && (
                      <span>
                        Before: {history.map((item) => `${formatDate(item.startDate)} – ${formatDate(item.endDate)}`).join(', ')}
                      </span>
                    )}
                    {canEdit && plan && (
                      <>
                        <button type="button" onClick={() => startAdding(entry.id)} className="font-semibold text-[#be185d] hover:underline">
                          Renew
                        </button>
                        <button type="button" onClick={() => void remove(plan)} className="font-semibold text-slate-500 hover:underline">
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {isAdding && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-slate-600">Subject</span>
            <select
              value={classroomId ?? ''}
              onChange={(event) => startAdding(event.target.value ? Number(event.target.value) : null)}
              className={input}
            >
              {classes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-slate-600">First day</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="w-20 text-slate-600">Months</span>
              <input
                type="number"
                min={1}
                max={60}
                step={1}
                value={months}
                onChange={(event) => setMonths(event.target.value)}
                className={`${input} w-20`}
              />
            </label>
            {endPreview && <span className="text-slate-600">Ends {formatDate(endPreview)}</span>}
          </div>
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-slate-600">Note</span>
            <input
              type="text"
              value={remark}
              maxLength={500}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="Optional"
              className={`${input} min-w-0 flex-1`}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsAdding(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700">
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || classroomId === null || !startDate || !validMonths}
              onClick={() => void save()}
              className="rounded-lg bg-[#fc0c97] px-3 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save months'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}

function addOneDay(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
