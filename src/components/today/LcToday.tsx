import { fetchTodayLc, type TodayLc } from '../../lib/today'
import { useTodayData } from '../../hooks/useTodayData'
import { TodayCard, TodayChip, TodayKpis, TodayRow, TodayRows, todayPrimaryButton, todaySecondaryButton } from './TodayParts'

type LcTodayProps = {
  personId: number | null
  roleName: string
  onOpenStudent: (studentId: number) => void
  preloaded?: TodayLc | null
}

// The learning-consultant (LC) version of Today: their own students who are at risk, whose package ends, who missed a
// lesson today, birthdays, progress cards, this month. A card with nothing in it is not drawn.
export function LcToday({ personId, roleName, onOpenStudent, preloaded }: LcTodayProps) {
  const fetched = useTodayData(fetchTodayLc, personId)
  const data = preloaded === undefined ? fetched.data : preloaded
  if (!data) {
    return null
  }

  const open = (studentId: number) => (
    <button type="button" className={todaySecondaryButton} onClick={() => onOpenStudent(studentId)}>
      Open student
    </button>
  )

  return (
    <div className="space-y-4">
      {data.atRisk.length > 0 && (
        <TodayCard id="lc-risk" title="Students at risk" summary={`${data.atRisk.length} to contact first`}>
          <TodayRows>
            {data.atRisk.map((student) => (
              <TodayRow
                key={student.studentId}
                title={student.name}
                sub={student.why}
                actions={
                  <>
                    <TodayChip tone="bad">At risk</TodayChip>
                    <button type="button" className={todayPrimaryButton} onClick={() => onOpenStudent(student.studentId)}>
                      Open student
                    </button>
                  </>
                }
              />
            ))}
          </TodayRows>
        </TodayCard>
      )}

      {data.absentToday.length > 0 && (
        <TodayCard id="lc-absent" title="Absent today" summary="Ask the parent why">
          <TodayRows>
            {data.absentToday.map((student) => (
              <TodayRow
                key={student.studentId}
                title={student.name}
                sub={student.status}
                actions={open(student.studentId)}
              />
            ))}
          </TodayRows>
        </TodayCard>
      )}

      {data.expiring.length > 0 && (
        <TodayCard id="lc-expiring" title="Package ending" summary="Within 14 days, or one lesson left">
          <TodayRows>
            {data.expiring.map((student) => (
              <TodayRow
                key={student.studentId}
                title={student.name}
                sub={[
                  student.endsOn ? `Ends ${student.endsOn}` : null,
                  student.lessonsLeft !== null ? `${student.lessonsLeft} lessons left` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                actions={open(student.studentId)}
              />
            ))}
          </TodayRows>
        </TodayCard>
      )}

      {data.birthdays.length > 0 && (
        <TodayCard id="lc-birthdays" title="Birthdays today">
          <TodayRows>
            {data.birthdays.map((student) => (
              <TodayRow key={student.studentId} title={student.name} actions={open(student.studentId)} />
            ))}
          </TodayRows>
        </TodayCard>
      )}

      {data.available && (
        <TodayCard id="lc-month" title={`My ${roleName} month`}>
          <TodayKpis
            items={[
              { label: 'Students', value: String(data.students) },
              { label: 'Students at risk', value: String(data.atRisk.length) },
              { label: 'Subjects added', value: `+${data.staysAdded}` },
              { label: 'Subjects stopped', value: `−${data.staysStopped}` },
              {
                label: 'Progress cards sent',
                value: `${data.cardsSent} / ${data.cardsDue}`,
              },
            ]}
          />
        </TodayCard>
      )}
    </div>
  )
}
