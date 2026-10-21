type NumberCheckPromptProps = {
  studentName: string
  // The chat's number, as the team sees it.
  phone: string
  busy: boolean
  problem: string | null
  onAnotherParent: () => void
  onChildPhone: () => void
  onCancel: () => void
}

// Asked when the chat is said to be the student (or is tied to one) but its number is not a number the school has
// for that student: a mum and a dad each write from their own phone, so the child is not the only answer.
export function NumberCheckPrompt({ studentName, phone, busy, problem, onAnotherParent, onChildPhone, onCancel }: NumberCheckPromptProps) {
  const buttonClass = 'rounded-full border px-3 py-1 font-semibold disabled:opacity-50'
  return (
    <section aria-label="Check the number" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="font-semibold">
        This number is not {studentName}&apos;s registered number (+{phone.replace(/\D/g, '')}).
      </p>
      <p>Save it as another parent&apos;s number, or are you sure it is the child&apos;s own phone?</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={busy} onClick={onAnotherParent} className={`${buttonClass} border-[#fc0c97] bg-[#ffe4f2] text-[#be185d]`}>
          Save as another parent
        </button>
        <button type="button" disabled={busy} onClick={onChildPhone} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>
          Sure, the child&apos;s phone
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="px-2 py-1 font-medium text-slate-600 hover:underline disabled:opacity-50">
          Cancel
        </button>
      </div>
      {problem && <p className="text-red-700">{problem}</p>}
    </section>
  )
}
