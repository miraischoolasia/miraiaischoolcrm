import { GRADE_OPTIONS, LEFT_SCHOOL, gradeLabel } from '../lib/grade'

// Pick a school grade (Year 1 to Form 5) for a school that shows grade instead of age. `value` is the grade as text
// ('' = none); a child who has already left school shows that too.
export function GradeSelect({
  value,
  onChange,
  className,
  ariaLabel = 'Grade',
  placeholder = 'Grade',
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  ariaLabel?: string
  placeholder?: string
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel} className={className}>
      <option value="">{placeholder}</option>
      {GRADE_OPTIONS.map((option) => (
        <option key={option.level} value={String(option.level)}>
          {option.label}
        </option>
      ))}
      {value === String(LEFT_SCHOOL) && <option value={String(LEFT_SCHOOL)}>{gradeLabel(LEFT_SCHOOL)}</option>}
    </select>
  )
}
