import { fetchTodayTeam, type TodayTeam } from '../../lib/today'
import { useRoleNames } from '../../lib/roleNames'
import { useTodayData } from '../../hooks/useTodayData'
import { money, TodayCard, TodayChip, TodayRow, TodayRows, todaySecondaryButton } from './TodayParts'

type TeamTodayProps = {
  onOpenLead: (leadId: number) => void
  onOpenPerson?: (teacherId: number) => void
  preloaded?: TodayTeam | null
}

// Admin only: quotations waiting for an approval, and one line for every person on the team, so whoever is behind
// shows at once. Nothing is drawn when there is nothing to show.
export function TeamToday({ onOpenLead, onOpenPerson, preloaded }: TeamTodayProps) {
  const fetched = useTodayData(() => fetchTodayTeam(), null)
  const names = useRoleNames()
  const data = preloaded === undefined ? fetched.data : preloaded
  if (!data) {
    return null
  }
  const people = data.people.filter((person) => person.isEc || person.isLc || person.lessonsToday > 0 || person.overdueFollowups > 0)

  return (
    <div className="space-y-4">
      {data.approvals.length > 0 && (
        <TodayCard id="team-approvals" title="Waiting for you to approve" summary={`${data.approvals.length} quotation(s) with a discount over the limit`}>
          <TodayRows>
            {data.approvals.map((quote) => (
              <TodayRow
                key={quote.reference}
                title={`${quote.childName} · ${money(quote.total)}`}
                sub={`${quote.reference} · ${money(quote.discountAmount)} off`}
                actions={
                  quote.leadId !== null ? (
                    <button type="button" className={todaySecondaryButton} onClick={() => onOpenLead(quote.leadId as number)}>
                      Open lead
                    </button>
                  ) : undefined
                }
              />
            ))}
          </TodayRows>
        </TodayCard>
      )}

      {people.length > 0 && (
        <TodayCard id="team-today" title="The team today" summary="Who is behind shows at once">
          <div className="overflow-x-auto px-4 pb-4">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 font-semibold">Job</th>
                  <th className="py-2 pr-3 font-semibold">Late follow-ups</th>
                  <th className="py-2 pr-3 font-semibold">Converted this month</th>
                  <th className="py-2 pr-3 font-semibold">Students at risk</th>
                  <th className="py-2 pr-3 font-semibold">Lessons today / not taken</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.teacherId} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-900">
                      {onOpenPerson ? (
                        <button type="button" className="underline underline-offset-4" onClick={() => onOpenPerson(person.teacherId)}>
                          {person.name}
                        </button>
                      ) : (
                        person.name
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {[person.isEc ? names.ec : null, person.isLc ? names.lc : null, person.lessonsToday > 0 ? 'Teacher' : null]
                        .filter(Boolean)
                        .join(' + ') || '–'}
                    </td>
                    <td className="py-2 pr-3">
                      {person.isEc ? person.overdueFollowups > 0 ? <TodayChip tone="bad">{person.overdueFollowups}</TodayChip> : '0' : '–'}
                    </td>
                    <td className="py-2 pr-3">{person.isEc ? person.convertedMonth : '–'}</td>
                    <td className="py-2 pr-3">
                      {person.isLc ? person.atRisk > 0 ? <TodayChip tone="warn">{person.atRisk}</TodayChip> : '0' : '–'}
                    </td>
                    <td className="py-2 pr-3">
                      {person.lessonsToday > 0 ? (
                        <>
                          {person.lessonsToday} / {person.notTaken > 0 ? <TodayChip tone="bad">{person.notTaken}</TodayChip> : '0'}
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TodayCard>
      )}
    </div>
  )
}
