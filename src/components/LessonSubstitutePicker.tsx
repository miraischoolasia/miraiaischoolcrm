// Picks who covers one class day (or none: the class teacher takes it). The
// substitute may take that day's attendance.
export type LessonSubstitutePickerProps = {
  teacherId: number | null
  teacherName: string | null
  // Everyone who may cover: teaching accounts other than the class's teacher.
  options: { id: number; name: string }[]
  isSaving: boolean
  onChange: (teacherId: number | null) => void
}

export function LessonSubstitutePicker({ teacherId, teacherName, options, isSaving, onChange }: LessonSubstitutePickerProps) {
  return (
    <label className="flex items-center gap-2">
      <span>Substitute teacher</span>
      <select
        value={teacherId ?? ''}
        disabled={isSaving}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 disabled:opacity-60"
      >
        <option value="">None (class teacher)</option>
        {teacherId !== null && !options.some((option) => option.id === teacherId) && (
          <option value={teacherId}>{teacherName}</option>
        )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}
