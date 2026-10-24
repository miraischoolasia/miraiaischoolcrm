import { useEffect, useState } from 'react'
import { fetchFollowUpCompletion, percent, type FollowUpCompletionRow } from '../lib/followUpCompletion'

// Today page, for an admin: this month's follow-ups by person (done, on time, overdue).
export function FollowUpCompletion({ nameOf, now }: { nameOf: (teacherId: number | null) => string | null; now?: Date }) {
  const today = now ?? new Date()
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const [rows, setRows] = useState<FollowUpCompletionRow[] | null>(null)

  useEffect(() => {
    let live = true
    void fetchFollowUpCompletion(month).then((next) => {
      if (live) setRows(next)
    })
    return () => {
      live = false
    }
  }, [month])

  if (!rows || rows.length === 0) {
    return null
  }
  const sorted = [...rows].sort((a, b) => b.scheduled - a.scheduled)
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table aria-label="Follow-ups this month by person" className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-1.5 font-semibold">This month</th>
            <th className="px-3 py-1.5 font-semibold">Scheduled</th>
            <th className="px-3 py-1.5 font-semibold">Done</th>
            <th className="px-3 py-1.5 font-semibold">On time</th>
            <th className="px-3 py-1.5 font-semibold">Overdue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((row) => {
            const done = percent(row.done, row.scheduled)
            const onTime = percent(row.onTime, row.scheduled)
            return (
              <tr key={row.assigneeId ?? 'nobody'}>
                <td className="px-3 py-1.5 font-medium text-slate-800">{nameOf(row.assigneeId) ?? 'Nobody'}</td>
                <td className="px-3 py-1.5 text-slate-700">{row.scheduled}</td>
                <td className="px-3 py-1.5 text-slate-700">
                  {row.done}
                  {done !== null ? ` (${done}%)` : ''}
                </td>
                <td className="px-3 py-1.5 text-slate-700">{onTime !== null ? `${onTime}%` : '-'}</td>
                <td className={row.overdue > 0 ? 'px-3 py-1.5 font-semibold text-red-700' : 'px-3 py-1.5 text-slate-700'}>{row.overdue}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
