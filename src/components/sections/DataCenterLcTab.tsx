import { Fragment, useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { lcTotal, stayRate, stopRate, type fetchLcReport, type fetchRiskStudents, type LcRow, type RiskStudent } from '../../lib/dataCenter'

// Data Center part 2: each Learning Consultant's students this month — who stayed, the classes added and stopped,
// who is at risk (department 2's student-care alerts, or stopped every class), progress cards sent.

export type LcApi = { lcReport: typeof fetchLcReport; riskStudents: typeof fetchRiskStudents }

const percent = (n: number | null) => (n === null ? '—' : `${n}%`)

export function LcTab({ api, thisMonth }: { api: LcApi; thisMonth: string }) {
  const [month, setMonth] = useState(thisMonth)
  const [rows, setRows] = useState<LcRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<number | null | undefined>(undefined)
  const [risk, setRisk] = useState<RiskStudent[] | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setOpen(undefined)
    void api.lcReport(month).then((result) => {
      if (!alive) return
      setRows(result.rows)
      setError(result.error)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [api, month])

  const toggle = (lcId: number | null) => {
    if (open === lcId) {
      setOpen(undefined)
      return
    }
    setOpen(lcId)
    setRisk(null)
    void api.riskStudents(month, lcId).then((result) => setRisk(result.rows))
  }

  const line = (row: LcRow, strong: boolean) => (
    <tr className={cn('border-t border-slate-100', strong && 'bg-pink-50/40 font-semibold')}>
      <td className="px-3 py-2">{row.lcName}</td>
      <td className="px-3 py-2 text-right">{row.students}</td>
      <td className="px-3 py-2 text-right" title={`${row.studentsStillIn} of ${row.studentsAtStart} students at the month's start are still in class`}>
        {percent(stayRate(row))}
      </td>
      <td className="px-3 py-2 text-right text-slate-600">
        {row.staysAtStart} / +{row.staysAdded} / −{row.staysStopped}
      </td>
      <td className="px-3 py-2 text-right">{percent(stopRate(row))}</td>
      <td className="px-3 py-2 text-right">
        {strong || row.atRisk === 0 ? (
          row.atRisk
        ) : (
          <button type="button" aria-expanded={open === row.lcId} onClick={() => toggle(row.lcId)} className="font-semibold text-red-700 hover:underline">
            {row.atRisk} at risk
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {row.cardsSent} / {row.cardsDue}
      </td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <label className="flex w-fit items-center gap-2 text-sm text-slate-700">
        Month
        <input
          type="month"
          aria-label="LC month"
          value={month}
          max={thisMonth}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <p className="text-xs text-slate-500">
        A student's LC is their Learning Consultant, else whoever handles them. Classes and changes follow the Students page's roster rule.
      </p>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">LC</th>
                <th className="px-3 py-2 text-right font-semibold" title="Regular students in class at the month's end (or today)">Students</th>
                <th className="px-3 py-2 text-right font-semibold" title="Students in class at the month's start who are still in class at its end">Stayed</th>
                <th className="px-3 py-2 text-right font-semibold" title="Class places at the start / added / stopped this month">Classes start / + / −</th>
                <th className="px-3 py-2 text-right font-semibold" title="Class places stopped ÷ (at the start + added)">Stop rate</th>
                <th className="px-3 py-2 text-right font-semibold" title="A student-care alert this month (absent streak, low participation, leaving early), or stopped every class">At risk</th>
                <th className="px-3 py-2 text-right font-semibold" title="This month's progress cards sent / students in class this month">Progress cards</th>
              </tr>
            </thead>
            <tbody>
              {line(lcTotal(rows), true)}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No students in class this month.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <Fragment key={row.lcId ?? 'nobody'}>
                  {line(row, false)}
                  {open === row.lcId && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-6 py-3">
                        {risk === null ? (
                          <p className="text-sm text-slate-500">Loading…</p>
                        ) : (
                          <ul className="space-y-1 text-xs">
                            {risk.map((r) => (
                              <li key={r.studentId}>
                                <span className="font-semibold text-slate-900">
                                  {r.code ? `${r.code} · ` : ''}
                                  {r.name}
                                </span>
                                {' — '}
                                {[r.stoppedAll ? 'stopped every class this month' : null, ...r.reasons].filter(Boolean).join('; ')}
                                {!r.cardSent && <span className="ml-1 text-slate-400">(no progress card yet)</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
