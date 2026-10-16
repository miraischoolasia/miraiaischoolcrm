import { cn } from '../lib/cn'

export function StarRatingInput({
  value,
  disabled,
  onChange,
  max = 5,
  label,
}: {
  value: number | null
  disabled?: boolean
  onChange: (score: number) => void
  // The criterion's top score.
  max?: number
  // Names the stars for screen readers ("Rate Teamwork 2 out of 3").
  label?: string
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max }, (_, index) => index + 1).map((score) => {
        const active = (value ?? 0) >= score
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            aria-label={label ? `Rate ${label} ${score} out of ${max}` : `Rate ${score} out of ${max}`}
            aria-pressed={active}
            className={cn(
              'text-xl leading-none transition',
              active ? 'text-amber-400' : 'text-slate-300',
              !disabled && 'hover:text-amber-300',
              disabled && 'cursor-not-allowed opacity-70',
            )}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}
