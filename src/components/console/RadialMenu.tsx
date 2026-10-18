import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { radialPositions } from '../../lib/radialMenu'

export type RadialItem = {
  key: string
  icon: string
  label: string
  // A colour for the button (Tailwind classes for the background and text).
  tone: string
  onPick: () => void
}

// The one-tap ring: round buttons pop out around the child's face (`anchor`,
// the face's centre on screen), one after another; tapping one does it at
// once. Escape or a tap outside closes it. It sits above the whole page, so
// nothing cuts it off, and moves in from the edges to stay on screen.
export function RadialMenu({
  items,
  anchor,
  radius = 70,
  onClose,
}: {
  items: RadialItem[]
  anchor: { x: number; y: number }
  radius?: number
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const positions = radialPositions(items.length, radius)
  const margin = radius + 30
  const x = Math.min(Math.max(anchor.x, margin), window.innerWidth - margin)
  const y = Math.min(Math.max(anchor.y, margin), window.innerHeight - margin)

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

  return createPortal(
    <>
      <button type="button" aria-label="Close the menu" className="fixed inset-0 z-[70] cursor-default bg-slate-900/15" onClick={onClose} />
      <div role="menu" aria-label="Quick actions" className="pointer-events-none fixed z-[71] h-0 w-0" style={{ left: x, top: y }}>
        <div
          aria-hidden="true"
          className="absolute rounded-full bg-white/90 shadow-xl ring-1 ring-slate-200 transition duration-200"
          style={{
            width: radius * 2 + 52,
            height: radius * 2 + 52,
            left: -(radius + 26),
            top: -(radius + 26),
            transform: open ? 'scale(1)' : 'scale(0.3)',
            opacity: open ? 1 : 0,
          }}
        />
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
            className={`group pointer-events-auto absolute flex h-11 w-11 items-center justify-center rounded-full text-lg shadow-md ring-2 ring-white transition duration-200 ease-out hover:scale-110 focus:scale-110 focus:outline-none ${item.tone}`}
            style={{
              left: -22,
              top: -22,
              transform: open ? `translate(${positions[index].x}px, ${positions[index].y}px) scale(1)` : 'translate(0px, 0px) scale(0.2)',
              opacity: open ? 1 : 0,
              transitionDelay: `${index * 35}ms`,
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="pointer-events-none absolute top-full z-10 mt-1 hidden whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold text-white group-hover:block group-focus:block">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  )
}
