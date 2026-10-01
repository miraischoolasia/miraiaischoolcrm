import { ClipboardText } from '@phosphor-icons/react'

// Marks a lead that came with form answers; opens them.
export function FormAnswersChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="View form answers"
      title="View the answers this lead gave in a form"
      className="inline-flex items-center gap-1 rounded-full bg-[#fff0f9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#be185d] transition hover:bg-[#ffe0f2]"
    >
      <ClipboardText size={11} aria-hidden="true" />
      Form
    </button>
  )
}
