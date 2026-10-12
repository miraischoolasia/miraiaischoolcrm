import { cn } from '../../lib/cn'

// The on / off switch. The track is drawn inside the button, so the button can keep the touch-sized
// height phones get.
export function FlowSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="flex shrink-0 items-center justify-center px-1 disabled:opacity-50"
    >
      <span
        className={cn(
          'relative block h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-[#fc0c97]' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}
