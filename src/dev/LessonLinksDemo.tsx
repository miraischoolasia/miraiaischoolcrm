import { useState } from 'react'
import { ScheduleModal } from '../components/modals/ScheduleModal'
import { buildScheduleFormState } from '../lib/schedule'
import { normalizeLessonLink, regularLessonOwner } from '../lib/scheduleLinks'
import type { Classroom, Schedule, ScheduleFormState, Teacher } from '../types/domain'

// Only the dev server shows this (/?demo=lessonlinks): the lesson form of one of EduHero's weekly
// lessons with made-up data and no network, to look at the FB group / fixed Zoom link fields.

const TODAY = '2026-10-26'

const classroom: Classroom = {
  category: 'regular',
  id: 29,
  name: 'SCI Form 1',
  ageGroup: 'Form 1',
  programLevel: '常规班',
  teacherId: 26,
  status: 'active',
  notes: null,
  archivedAt: null,
  zoomLink: null,
  teacherIds: [26, 52],
}

function teacher(id: number, fullName: string): Teacher {
  return { id, authUserId: null, username: fullName, fullName, email: null, phone: null, role: 'teacher', isActive: true, permissions: {} as Teacher['permissions'] }
}

const teachers = [teacher(26, 'Ms Angeline'), teacher(52, 'Ms Joey')]

const lesson: Schedule = {
  id: 1,
  teacherId: 52,
  classroomId: 29,
  title: 'F1 SAINS MS JOEY',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 1,
  scheduledDate: null,
  startTime: '08:15',
  endTime: '09:30',
  startRecur: TODAY,
  endRecur: '2026-12-31',
  status: 'active',
  notes: null,
  fbGroupUrl: 'https://www.facebook.com/groups/1383895296427020',
  zoomLink: null,
}

export function LessonLinksDemo() {
  const [form, setForm] = useState<ScheduleFormState>(() => buildScheduleFormState(lesson, TODAY, null, []))
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      {saved && (
        <pre aria-label="Saved lesson" className="fixed bottom-2 left-2 z-[100] rounded bg-slate-900 p-2 text-xs text-white">
          {saved}
        </pre>
      )}
      <ScheduleModal
        isCreatingSchedule={false}
        editingSchedule={lesson}
        formState={form}
        saveError={error}
        isSaving={false}
        activeVisibleClassrooms={[classroom]}
        scheduleLinkedClassroom={classroom}
        scheduleClassroomRoster={[]}
        teacherMap={new Map(teachers.map((entry) => [entry.id, entry]))}
        assignableTeachers={teachers}
        students={[]}
        todayString={TODAY}
        onClose={() => undefined}
        onSubmit={(event) => {
          event.preventDefault()
          const fb = normalizeLessonLink(form.fbGroupUrl)
          const zoom = normalizeLessonLink(form.zoomLink)
          if (fb.error || zoom.error) {
            setError(fb.error ? `The FB group link ${fb.error}.` : `The Zoom link ${zoom.error}.`)
            return
          }
          setError(null)
          const owner = regularLessonOwner(classroom, lesson)
          setSaved(JSON.stringify({ teacher_id: owner.teacherId, title: owner.title, fb_group_url: fb.link, zoom_link: zoom.link }))
        }}
        onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
        onToggleParticipant={() => undefined}
        occurrenceDate={null}
        isOccurrenceLogged={false}
        onCancelOccurrence={() => undefined}
      />
    </>
  )
}
