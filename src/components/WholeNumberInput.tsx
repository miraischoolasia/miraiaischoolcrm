import { useEffect, useState } from 'react'

// A whole number between min and max that can be typed freely: the box may be
// empty or out of range while typing (so 100 can be cleared and 80 typed),
// and is put back in range when it loses focus.
export function WholeNumberInput({
  value,
  min,
  max,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  className?: string
  'aria-label'?: string
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText((current) => (Number(current) === value && current.trim() !== '' ? current : String(value)))
  }, [value])

  function settle() {
    const typed = Math.round(Number(text))
    const next = text.trim() === '' || !Number.isFinite(typed) ? value : Math.min(max, Math.max(min, typed))
    setText(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        const typed = Number(event.target.value)
        if (event.target.value.trim() !== '' && Number.isInteger(typed) && typed >= min && typed <= max) onChange(typed)
      }}
      onBlur={settle}
      onKeyDown={(event) => {
        if (event.key === 'Enter') settle()
      }}
      className={className}
      aria-label={ariaLabel}
    />
  )
}
