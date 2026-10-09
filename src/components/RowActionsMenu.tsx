import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DotsThree } from '@phosphor-icons/react'
import { cn } from '../lib/cn'

export type RowAction = {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

// The "..." button at the end of a table row. The menu is drawn on the page
// itself, so a row near the bottom of a scrolling table is not clipped.
export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) {
      return
    }
    const button = buttonRef.current.getBoundingClientRect()
    const menu = menuRef.current.getBoundingClientRect()
    const fitsBelow = button.bottom + menu.height + 12 <= window.innerHeight
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - menu.width - 8, button.right - menu.width)),
      top: fitsBelow ? button.bottom + 4 : Math.max(8, button.top - menu.height - 4),
    })
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const close = () => setOpen(false)
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        close()
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close()
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-slate-600 transition hover:bg-slate-50"
      >
        <DotsThree size={18} weight="bold" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ left: position.left, top: position.top }}
            className="fixed z-[70] min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false)
                  action.onSelect()
                }}
                className={cn(
                  'block w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
                  action.danger
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
