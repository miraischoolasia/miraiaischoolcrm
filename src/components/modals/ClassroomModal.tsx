import { X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { useProgramLevels } from '../../lib/programLevels'
import { useAgeGroups } from '../../lib/ageGroups'
import type { AgeGroup, ClassroomCategory, Classroom, ClassroomFormState, ProgramLevel, Teacher } from '../../types/domain'
import type { Programme } from '../../lib/programmes'
import type { Subject } from '../../lib/subjects'

type ClassroomModalProps = {
  isCreating: boolean
  editingClassroom: Classroom | null
  assignableTeachers: Teacher[]
  formState: ClassroomFormState
  // The school's enrolment flows (programmes); a class follows its level's flow unless it names its own.
  programmes?: Programme[]
  // The flow each class level follows, by level name (null: none).
  levelFlowIds?: Map<string, number | null>
  // The school's subjects; the class's one picks the questions that fit it.
  subjects?: Subject[]
  saveError: string | null
  isSaving: boolean
  onClose: () => void
  onSubmit: React.FormEventHandler<HTMLFormElement>
  onFieldChange: (
    field: keyof ClassroomFormState,
    value: string | AgeGroup | ProgramLevel,
  ) => void
}

export function ClassroomModal({
  isCreating,
  editingClassroom,
  assignableTeachers,
  formState,
  programmes = [],
  levelFlowIds,
  subjects = [],
  saveError,
  isSaving,
  onClose,
  onSubmit,
  onFieldChange,
}: ClassroomModalProps) {
  // The school's levels, plus this class's own if it is hidden now.
  const schoolLevels = useProgramLevels()
  const programLevelOptions = schoolLevels.includes(formState.programLevel) ? schoolLevels : [...schoolLevels, formState.programLevel]
  // The school's age groups, plus this class's own if it is hidden now.
  const schoolAgeGroups = useAgeGroups()
  const ageGroupOptions = schoolAgeGroups.includes(formState.ageGroup) ? schoolAgeGroups : [...schoolAgeGroups, formState.ageGroup]
  const isTeacherChanging =
    !isCreating &&
    editingClassroom !== null &&
    formState.teacherId !== '' &&
    formState.teacherId !== String(editingClassroom.teacherId ?? '')
  const programme = programmes.find((entry) => String(entry.id) === formState.programmeId) ?? null
  // A programme the school made has no use for the age group and level written for Mirai's own courses.
  const ownProgramme = programme !== null && programme.legacyKey === null

  function chooseProgramme(value: string) {
    onFieldChange('programmeId', value)
    const chosen = programmes.find((entry) => String(entry.id) === value)
    // A programme that keeps a place for the lead needs a trial class; one that enrols the lead, a regular class.
    if (chosen && chosen.legacyKey === null) {
      onFieldChange('category', chosen.outcome === 'booking' ? 'trial' : 'regular')
    }
  }

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#be185d]">
              Classroom setup
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              {isCreating ? 'Add Classroom' : editingClassroom?.name ?? 'Edit Classroom'}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Organize regular and trial classes by age group, level, assigned
              teacher, and weekly timetable ownership.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <form
        data-modal-body
        onSubmit={onSubmit}
        className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8"
      >
        {saveError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {programmes.length > 0 && (
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Enrolment flow</span>
              <select
                value={formState.programmeId}
                onChange={(event) => chooseProgramme(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              >
                <option value="">
                  {levelFlowIds
                    ? `Follow ${formState.programLevel || 'the class level'} (${
                        programmes.find((entry) => entry.id === levelFlowIds.get(formState.programLevel))?.name ?? 'no flow'
                      })`
                    : 'No flow'}
                </option>
                {programmes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.isActive ? '' : ' (off)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                {programme && ownProgramme
                  ? programme.outcome === 'booking'
                    ? 'The Inbox offers this class to parents of this programme to keep a place (a Trial Class).'
                    : 'The Inbox offers this class to parents of this programme to join as a student (a Regular Class).'
                  : 'The steps the team follows when a parent signs up for this class in the Inbox.'}
              </p>
            </label>
          )}
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Classroom Category</span>
            <select value={formState.category} onChange={(event) => onFieldChange('category', event.target.value as ClassroomCategory)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900">
              <option value="regular">Regular Class</option>
              <option value="trial">Trial Class</option>
              <option value="camp">Camp Class (Holiday Camp)</option>
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Classroom Name
            </span>
            <input
              type="text"
              value={formState.name}
              onChange={(event) =>
                onFieldChange('name', event.target.value)
              }
              placeholder="Example: Tuesday Innovator Group A"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>

          {!ownProgramme && (
            <>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Age Group
            </span>
            <select
              value={formState.ageGroup}
              onChange={(event) =>
                onFieldChange(
                  'ageGroup',
                  event.target.value as AgeGroup,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              {ageGroupOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">
              Program Level
            </span>
            <select
              value={formState.programLevel}
              onChange={(event) =>
                onFieldChange(
                  'programLevel',
                  event.target.value as ProgramLevel,
                )
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              {programLevelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
            </>
          )}

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Assigned Teacher
            </span>
            <select
              value={formState.teacherId}
              onChange={(event) =>
                onFieldChange('teacherId', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            >
              <option value="">Select teacher</option>
              {assignableTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
            {assignableTeachers.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No teacher account is available yet. Add a teacher first,
                then create the classroom.
              </div>
            )}
          </label>

          {isTeacherChanging && (
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                New teacher starts from
              </span>
              <input
                type="date"
                required
                value={formState.teacherEffectiveDate}
                onChange={(event) =>
                  onFieldChange('teacherEffectiveDate', event.target.value)
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
              />
              <p className="text-xs text-slate-500">
                Classes before this date stay with the current teacher on the
                calendar and in attendance history. From this date on, the class
                and its students move to the new teacher.
              </p>
            </label>
          )}

          {subjects.some((subject) => subject.isActive || String(subject.id) === formState.subjectId) && (
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">Subject</span>
              <select
                value={formState.subjectId}
                onChange={(event) => onFieldChange('subjectId', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              >
                <option value="">No subject</option>
                {subjects
                  .filter((subject) => subject.isActive || String(subject.id) === formState.subjectId)
                  .map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-slate-500">The Question Bank shows this class the questions of its subject and age group.</p>
            </label>
          )}

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Zoom Link
            </span>
            <input
              type="url"
              inputMode="url"
              value={formState.zoomLink}
              onChange={(event) => onFieldChange('zoomLink', event.target.value)}
              placeholder="https://zoom.us/j/..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
            <p className="text-xs text-slate-500">
              Optional. Where this class meets on Zoom; shown on the teacher's details.
            </p>
          </label>

          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Notes
            </span>
            <textarea
              rows={4}
              value={formState.notes}
              onChange={(event) =>
                onFieldChange('notes', event.target.value)
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving
              ? 'Saving...'
              : isCreating
                ? 'Create Classroom'
                : 'Save Classroom'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
