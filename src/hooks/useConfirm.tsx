import { useCallback, useState } from 'react'
import { ModalShell } from '../components/ModalShell'

type ConfirmLabels = { confirmLabel?: string; cancelLabel?: string }

type ConfirmState = ConfirmLabels & {
  message: string
  resolve: (value: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((message: string, labels: ConfirmLabels = {}) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve, ...labels })
    })
  }, [])

  function respond(value: boolean) {
    state?.resolve(value)
    setState(null)
  }

  const dialog = state ? (
    <ModalShell maxWidth="sm" onClose={() => respond(false)} layer="overlay">
      <div className="px-6 py-6">
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{state.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => respond(false)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => respond(true)}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </ModalShell>
  ) : null

  return { confirm, dialog }
}
