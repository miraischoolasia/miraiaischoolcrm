import { cn } from '../lib/cn'

export function StarRatingInput({
  value,
  disabled,
  onChange,
}: {
  value: number | null
  disabled?: boolean
  onChange: (score: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5].map((score) => {
        const active = (value ?? 0) >= score
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            aria-label={`Rate ${score} out of 5`}
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
