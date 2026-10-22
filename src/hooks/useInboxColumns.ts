import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import {
  DEFAULT_COLUMNS,
  DETAILS_WIDTH,
  LIST_WIDTH,
  dragDetails,
  dragList,
  fitColumns,
  readColumns,
  saveColumns,
  type ColumnWidths,
} from '../lib/inboxColumns'

type Column = 'list' | 'details'

const browserStorage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// The details column only shows from this width up (Tailwind's xl), so only then is it dragged or counted.
const DETAILS_FROM = '(min-width: 1280px)'

// Lets the person drag the two lines between the Inbox's columns. `boxRef` is the grid holding the columns;
// `hasDetails` says whether a chat (and so its details panel) is open. Gives the grid's style (two CSS
// variables the grid's columns read) and the props for each line. While dragging, only the variable on the
// grid changes, frame by frame, so the chats and messages are not drawn again until the line is let go.
export function useInboxColumns(boxRef: RefObject<HTMLElement | null>, hasDetails: boolean) {
  const [chosen, setChosen] = useState<ColumnWidths>(() => readColumns(browserStorage()))
  const [boxWidth, setBoxWidth] = useState<number | null>(null)
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? false : (window.matchMedia?.(DETAILS_FROM).matches ?? false)))
  const withDetails = hasDetails && wide
  const shown = fitColumns(chosen, boxWidth, withDetails)

  const live = useRef<ColumnWidths | null>(null)
  const drag = useRef<{ column: Column; handle: HTMLElement; pointerId: number; startX: number; start: ColumnWidths; frame: number | null; cursor: string; select: string } | null>(null)

  useLayoutEffect(() => {
    const element = boxRef.current
    if (!element) return undefined
    // The inside width (without the box's border), rounded down, so the chat never ends up a pixel under its smallest width.
    const measure = () => setBoxWidth(element.clientWidth || null)
    measure()
    const watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    watcher?.observe(element)
    window.addEventListener('resize', measure)
    const media = window.matchMedia?.(DETAILS_FROM)
    const onMedia = () => setWide(media?.matches ?? false)
    media?.addEventListener?.('change', onMedia)
    return () => {
      watcher?.disconnect()
      window.removeEventListener('resize', measure)
      media?.removeEventListener?.('change', onMedia)
    }
  }, [boxRef])

  function paint(widths: ColumnWidths) {
    boxRef.current?.style.setProperty('--inbox-list', `${widths.list}px`)
    boxRef.current?.style.setProperty('--inbox-details', `${widths.details}px`)
  }

  function keep(widths: ColumnWidths) {
    setChosen(widths)
    saveColumns(browserStorage(), widths)
  }

  function finish(commit: boolean) {
    const current = drag.current
    if (!current) return
    if (current.frame !== null) cancelAnimationFrame(current.frame)
    document.body.style.cursor = current.cursor
    document.body.style.userSelect = current.select
    delete current.handle.dataset.active
    drag.current = null
    const result = live.current
    live.current = null
    // What is on screen when the line is let go becomes the choice, so nothing moves on release.
    if (commit && result && (result.list !== current.start.list || result.details !== current.start.details)) keep(result)
    else paint(current.start)
  }

  // A drag left half-way (the Inbox closed mid-drag) gives the page its cursor and text selection back.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => finish(false), [])

  function widthsFor(column: Column, start: ColumnWidths, moved: number): ColumnWidths {
    return column === 'list'
      ? { list: dragList(start, moved, boxWidth, withDetails), details: start.details }
      : { list: start.list, details: dragDetails(start, moved, boxWidth) }
  }

  function handleProps(column: Column) {
    const limits = column === 'list' ? LIST_WIDTH : DETAILS_WIDTH
    return {
      column,
      value: shown[column],
      min: limits.min,
      max: limits.max,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || drag.current) return
        event.preventDefault()
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch {
          // Some pens and old browsers cannot hold the pointer; the drag still follows it over the line.
        }
        drag.current = {
          column,
          handle: event.currentTarget,
          pointerId: event.pointerId,
          startX: event.clientX,
          start: shown,
          frame: null,
          cursor: document.body.style.cursor,
          select: document.body.style.userSelect,
        }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        live.current = shown
        // Marked on the line itself rather than in state, so starting a drag does not redraw the Inbox.
        event.currentTarget.dataset.active = 'true'
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) return
        live.current = widthsFor(current.column, current.start, event.clientX - current.startX)
        if (current.frame === null) {
          current.frame = requestAnimationFrame(() => {
            current.frame = null
            if (live.current) paint(live.current)
          })
        }
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(true),
      onLostPointerCapture: () => finish(true),
      // Double-click puts this column back to its first width.
      onDoubleClick: () => {
        finish(false)
        keep(column === 'list' ? { list: DEFAULT_COLUMNS.list, details: shown.details } : { list: shown.list, details: DEFAULT_COLUMNS.details })
      },
      // Arrow keys move the line 16px (64px with Shift); Home / End go to the smallest / largest; Enter resets.
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const step = event.shiftKey ? 64 : 16
        const toward = column === 'list' ? 1 : -1
        const moved =
          event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : event.key === 'Home' ? -10_000 * toward : event.key === 'End' ? 10_000 * toward : null
        if (event.key === 'Enter') {
          event.preventDefault()
          keep(column === 'list' ? { list: DEFAULT_COLUMNS.list, details: shown.details } : { list: shown.list, details: DEFAULT_COLUMNS.details })
          return
        }
        if (moved === null) return
        event.preventDefault()
        keep(widthsFor(column, shown, moved))
      },
    }
  }

  const drawn = live.current ?? shown
  const style = { '--inbox-list': `${drawn.list}px`, '--inbox-details': `${drawn.details}px` } as CSSProperties
  return { style, withDetails, list: handleProps('list'), details: handleProps('details') }
}

export type ColumnHandleProps = ReturnType<typeof useInboxColumns>['list']
