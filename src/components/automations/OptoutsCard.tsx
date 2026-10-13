import { useState } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { useConfirm } from '../../hooks/useConfirm'
import type { AutomationOptout } from '../../lib/automationOptouts'
import { formatPhone } from '../../lib/whatsappInbox'

type OptoutsCardProps = {
  optouts: AutomationOptout[]
  loadError: string | null
  onAllowAgain: (phone: string) => Promise<string | null>
}

// The numbers that wrote STOP: no automation sends to them. An admin can allow one again.
export function OptoutsCard({ optouts, loadError, onAllowAgain }: OptoutsCardProps) {
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  async function allow(entry: AutomationOptout) {
    if (
      !(await confirm(`Allow ${formatPhone(entry.phone)} to get automatic messages again?`, {
        confirmLabel: 'Allow again',
      }))
    ) {
      return
    }
    setProblem(null)
    const result = await onAllowAgain(entry.phone)
    if (result) {
      setProblem(result)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex-1 text-sm font-semibold text-slate-900">
          Asked to stop
          <span className="ml-2 font-normal text-slate-500">
            {optouts.length === 0 ? 'Nobody' : `${optouts.length} number${optouts.length === 1 ? '' : 's'}`}
          </span>
        </span>
        <span className="hidden text-xs text-slate-500 sm:inline">Parents who wrote STOP get nothing automatic</span>
        {open ? <CaretUp size={14} aria-hidden="true" /> : <CaretDown size={14} aria-hidden="true" />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-200 px-4 py-3">
          {loadError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          )}
          {optouts.length === 0 && !loadError && (
            <p className="text-sm text-slate-500">
              When a parent writes just STOP (or 不要再发, jangan hantar), their number is added here and no automation
              messages them again.
            </p>
          )}
          {optouts.length > 0 && (
            <ul className="space-y-1.5">
              {optouts.map((entry) => (
                <li key={entry.phone} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{formatPhone(entry.phone)}</p>
                    <p className="text-xs text-slate-500">
                      {entry.reason ?? 'Asked to stop'} · {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Allow ${formatPhone(entry.phone)} again`}
                    onClick={() => void allow(entry)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                  >
                    Allow again
                  </button>
                </li>
              ))}
            </ul>
          )}
          {problem && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {problem}
            </p>
          )}
        </div>
      )}
      {dialog}
    </section>
  )
}
