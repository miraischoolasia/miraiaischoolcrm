import type { ReactNode } from 'react'
import { fetchTodayTeacher, type TodayTeacher } from '../../lib/today'
import { useTodayData } from '../../hooks/useTodayData'
import { TodayCard, TodayChip, TodayRow, TodayRows, todaySecondaryButton } from './TodayParts'

type TeacherTodayProps = {
  personId: number | null
  // The teacher's own Today as it always was (next classes, attendance still to take, the week, their classes).
  children: ReactNode
  onOpenStudent: (studentId: number) => void
  preloaded?: TodayTeacher | null
}

// The teacher version: the page they always had, with the students to watch in their own classes put first when there
// are any. Nothing is added when there are none.
export function TeacherToday({ personId, children, onOpenStudent, preloaded }: TeacherTodayProps) {
  const fetched = useTodayData(fetchTodayTeacher, personId)
  const data = preloaded === undefined ? fetched.data : preloaded
  const watch = data?.watch ?? []

  return (
    <div className="space-y-4">
      {watch.length > 0 && (
        <TodayCard id="teacher-watch" title="Students to watch" summary="In your classes, flagged this month">
          <TodayRows>
            {watch.map((student) => (
              <TodayRow
                key={student.studentId}
                title={student.name}
                sub={[student.className, student.why].filter(Boolean).join(' · ')}
                actions={
                  <>
                    <TodayChip tone="warn">Watch</TodayChip>
                    <button type="button" className={todaySecondaryButton} onClick={() => onOpenStudent(student.studentId)}>
                      Open student
                    </button>
                  </>
                }
              />
            ))}
          </TodayRows>
        </TodayCard>
      )}
      {children}
    </div>
  )
}
