import { useEffect, useState } from 'react'
import { radialPositions } from '../../lib/radialMenu'

export type RadialItem = {
  key: string
  icon: string
  label: string
  // A colour for the button (Tailwind classes for the background and text).
  tone: string
  onPick: () => void
}

// The one-tap ring: round buttons pop out around the child's face, one after
// another; tapping one does it at once. Escape or a tap outside closes it.
export function RadialMenu({ items, radius = 66, onClose }: { items: RadialItem[]; radius?: number; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const positions = radialPositions(items.length, radius)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true))
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Only the ring closes, not the whole console.
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return (
    <>
      <button type="button" aria-label="Close the menu" className="fixed inset-0 z-20 cursor-default bg-slate-900/10" onClick={onClose} />
      <div role="menu" aria-label="Quick actions" className="pointer-events-none absolute left-1/2 top-[30px] z-30 h-0 w-0">
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            title={item.label}
            aria-label={item.label}
            onClick={(event) => {
              event.stopPropagation()
              item.onPick()
            }}
            className={`group pointer-events-auto absolute flex h-10 w-10 items-center justify-center rounded-full text-lg shadow-md ring-2 ring-white transition duration-200 ease-out hover:scale-110 focus:scale-110 focus:outline-none ${item.tone}`}
            style={{
              left: -20,
              top: -20,
              transform: open ? `translate(${positions[index].x}px, ${positions[index].y}px) scale(1)` : 'translate(0px, 0px) scale(0.2)',
              opacity: open ? 1 : 0,
              transitionDelay: `${index * 35}ms`,
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="pointer-events-none absolute top-full mt-1 hidden whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white group-hover:block group-focus:block">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
