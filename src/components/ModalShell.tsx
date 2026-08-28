import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export function ModalShell({
  children,
  maxWidth = '2xl',
  onClose,
}: {
  children: ReactNode
  maxWidth?: '2xl' | '760' | 'sm'
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Runs once on mount/unmount only — must not depend on `onClose`, which is a
  // fresh function identity on every parent re-render (e.g. every keystroke in
  // a form field). Re-running this on every render would re-focus the panel
  // and steal focus back from whatever input the user is typing in.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className={cn(
          'mx-auto flex min-h-full w-full items-center justify-center',
          maxWidth === '2xl' && 'max-w-2xl',
          maxWidth === '760' && 'max-w-[760px]',
          maxWidth === 'sm' && 'max-w-sm',
        )}
      >
        <div
          ref={panelRef}
          data-modal-shell
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)] outline-none"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
