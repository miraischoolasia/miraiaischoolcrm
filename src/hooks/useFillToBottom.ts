import { useLayoutEffect, useState, type RefObject } from 'react'

// How tall a box must be to reach from where it starts on the page down to the window's bottom edge,
// less a margin, and never shorter than `min`.
export function heightToBottom(top: number, windowHeight: number, gap: number, min: number) {
  return Math.max(min, Math.floor(windowHeight - top - gap))
}

// Makes a box reach down to the bottom of the window (less `gap`) and follow the window's height, so a page
// like the Inbox fills the screen whatever the screen's size. Only on screens at least `fromWidth` wide;
// below that (and before the first measure) it gives null and the box keeps its own height.
export function useFillToBottom(ref: RefObject<HTMLElement | null>, { gap = 16, min = 520, fromWidth = 1024 } = {}) {
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return undefined
    }
    const wide = window.matchMedia?.(`(min-width: ${fromWidth}px)`)
    function measure() {
      if (!element || (wide && !wide.matches)) {
        setHeight(null)
        return
      }
      const top = element.getBoundingClientRect().top + window.scrollY
      setHeight(heightToBottom(top, window.innerHeight, gap, min))
    }
    measure()
    window.addEventListener('resize', measure)
    wide?.addEventListener?.('change', measure)
    // Things above the box (a banner, the page title) can change height and move it.
    const watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    watcher?.observe(document.body)
    return () => {
      window.removeEventListener('resize', measure)
      wide?.removeEventListener?.('change', measure)
      watcher?.disconnect()
    }
  }, [ref, gap, min, fromWidth])

  return height
}
