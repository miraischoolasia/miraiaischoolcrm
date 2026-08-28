import { useCallback, useRef, useState } from 'react'
import { Info, WarningCircle, X } from '@phosphor-icons/react'
import { cn } from '../lib/cn'

type ToastState = {
  id: number
  message: string
  tone: 'error' | 'info'
} | null

const TOAST_DURATION_MS = 5000

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null)
  const idRef = useRef(0)

  const showToast = useCallback((message: string, tone: 'error' | 'info' = 'error') => {
    const id = ++idRef.current
    setToast({ id, message, tone })
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current))
    }, TOAST_DURATION_MS)
  }, [])

  const dismiss = useCallback(() => setToast(null), [])

  const toastHost = toast ? (
    <div className="fixed right-4 top-4 z-[60] w-full max-w-sm">
      <div
        role={toast.tone === 'error' ? 'alert' : 'status'}
        aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
        className={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.15)]',
          toast.tone === 'error'
            ? 'border-[#fecdd3] bg-[#fff1f8] text-[#be185d]'
            : 'border-slate-200 bg-white text-slate-700',
        )}
      >
        {toast.tone === 'error' ? (
          <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
        ) : (
          <Info size={20} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
        )}
        <p className="flex-1 text-sm font-medium">{toast.message}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="opacity-70 transition hover:opacity-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  ) : null

  return { showToast, toastHost }
}
