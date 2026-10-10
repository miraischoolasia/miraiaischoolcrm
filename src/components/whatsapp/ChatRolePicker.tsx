import type { ChatRole } from '../../lib/whatsappInbox'

type ChatRolePickerProps = {
  role: ChatRole | null
  // The student the chat is about, to say it in plain words.
  studentName: string
  // A chat tied to several children can only be the parent's.
  canBeStudent: boolean
  // Tapping the chosen one again takes the answer back (null).
  onPick: (role: ChatRole | null) => void
}

// One tap that says who is on the other end of the chat, so the list can name it
// "Albee's parent" or "Albee (student)" and nobody has to guess from a number.
export function ChatRolePicker({ role, studentName, canBeStudent, onPick }: ChatRolePickerProps) {
  const options: { value: ChatRole; label: string }[] = [
    { value: 'parent', label: `Parent of ${studentName}` },
    ...(canBeStudent ? [{ value: 'student' as const, label: `${studentName} themself` }] : []),
  ]

  return (
    <section className="space-y-1.5 text-xs" aria-label="Who is on this chat">
      <p className="font-semibold text-slate-700">Who is on this chat?</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={role === option.value}
            onClick={() => onPick(role === option.value ? null : option.value)}
            className={
              role === option.value
                ? 'rounded-full border border-[#fc0c97] bg-[#ffe4f2] px-3 py-1 font-semibold text-[#be185d]'
                : 'rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-50'
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      {role === null && <p className="text-slate-500">Pick one, so the chat list names it instead of showing a number.</p>}
    </section>
  )
}
