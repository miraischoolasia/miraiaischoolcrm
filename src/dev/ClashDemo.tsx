import { useMemo, useState } from 'react'
import { ScheduleModal } from '../components/modals/ScheduleModal'
import { MoveClassModal } from '../components/modals/MoveClassModal'
import { clashMessage, findTeacherClashes, type ClashCandidate } from '../lib/clash'
import type { Classroom, Schedule, ScheduleFormState, Teacher } from '../types/domain'

// Only the dev server shows this (/?demo=clash): the lesson form and the move window stopping a
// teacher time clash, on made-up lessons (nothing is saved, no network).

const joey = { id: 1, fullName: 'Ms Joey', role: 'teacher', isActive: true } as Teacher
const teacherMap = new Map<number, Teacher>([[1, joey]])
const room = { id: 1, name: 'SCI Year 5 · Ms Joey', category: 'regular', teacherId: 1, status: 'active', ageGroup: '9-11 Years Old', programLevel: 'Coder Foundation' } as Classroom
const classroomMap = new Map<number, Classroom>([[1, room]])
// Ms Joey: Mondays 7:00pm-8:15pm.
const schedules: Schedule[] = [
  {
    id: 10, teacherId: 1, classroomId: 1, title: 'SCI Year 5 · Ms Joey', eventType: 'regular', recurrenceType: 'weekly',
    dayOfWeek: 1, scheduledDate: null, startTime: '19:00', endTime: '20:15', startRecur: '2026-10-01', endRecur: null, status: 'active', notes: null,
  } as Schedule,
]

export function ClashDemo() {
  const [form, setForm] = useState<ScheduleFormState>({
    title: 'Extra class', teacherId: '1', classroomId: '', eventType: 'replacement', dayOfWeek: '1', scheduledDate: '2026-10-26',
    startTime: '19:30', endTime: '20:30', startRecur: '', endRecur: '', notes: '', participantIds: [],
  })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

  const clashes = useMemo(() => {
    const candidate: ClashCandidate = { kind: 'single', teacherId: 1, date: form.scheduledDate, startTime: form.startTime, endTime: form.endTime, today: '2026-10-20' }
    return findTeacherClashes(candidate, schedules, [], classroomMap)
  }, [form])
  const moveClashes = (startTime: string, endTime: string) =>
    findTeacherClashes({ kind: 'single', teacherId: 1, date: '2026-10-26', startTime, endTime, excludeScheduleId: 99 }, schedules, [], classroomMap)

  return (
    <div className="p-4">
      <button type="button" onClick={() => setMoving(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-semibold">
        Drag MM Year 6 onto Monday 26 Oct
      </button>
      {saved && <p role="status">Saved (demo).</p>}
      <ScheduleModal
        isCreatingSchedule
        editingSchedule={null}
        formState={form}
        saveError={saveError}
        isSaving={false}
        activeVisibleClassrooms={[room]}
        scheduleLinkedClassroom={null}
        scheduleClassroomRoster={[]}
        teacherMap={teacherMap}
        assignableTeachers={[joey]}
        students={[]}
        todayString="2026-10-20"
        onClose={() => undefined}
        onSubmit={(event) => {
          event.preventDefault()
          if (clashes.length > 0) {
            setSaveError(clashMessage('Ms Joey', clashes))
            return
          }
          setSaveError(null)
          setSaved(true)
        }}
        onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
        onToggleParticipant={() => undefined}
        occurrenceDate={null}
        isOccurrenceLogged={false}
        onCancelOccurrence={() => undefined}
        clashes={clashes}
        clashTeacherName="Ms Joey"
      />
      {moving && (
        <MoveClassModal
          draft={{ kind: 'regular', scheduleId: 99, title: 'MM Year 6 · Ms Joey', fromDate: '2026-10-21', fromStartTime: '19:00', toDate: '2026-10-26', startTime: '19:00', endTime: '20:00', names: ['Ali'], trialSlotOptions: [] }}
          isSaving={false}
          error={moveError}
          onClose={() => setMoving(false)}
          onConfirm={(input) => {
            const found = moveClashes(input.startTime, input.endTime)
            setMoveError(found.length > 0 ? clashMessage('Ms Joey', found) : null)
          }}
          getClashes={moveClashes}
          clashTeacherName="Ms Joey"
        />
      )}
    </div>
  )
}
