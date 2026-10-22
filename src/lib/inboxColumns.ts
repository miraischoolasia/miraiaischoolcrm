// How wide the Inbox's three columns are (chat list | chat | details) when the person drags the two lines
// between them. The chat in the middle takes what is left and never gets narrower than CHAT_MIN; the list
// and the details panel each stay between their own smallest and largest width.

export type ColumnWidths = { list: number; details: number }

export const LIST_WIDTH = { min: 280, max: 560, initial: 380 }
export const DETAILS_WIDTH = { min: 240, max: 480, initial: 280 }
export const CHAT_MIN = 360
export const DEFAULT_COLUMNS: ColumnWidths = { list: LIST_WIDTH.initial, details: DETAILS_WIDTH.initial }

const STORAGE_KEY = 'inbox-columns-v1'

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)))

// The widths to draw for what the person chose, in a box `boxWidth` wide (null before it is measured).
// A narrow window shrinks the details panel first, then the list, down to their smallest widths; when the
// window grows again the chosen widths come back, because the choice itself is never changed here.
export function fitColumns(chosen: ColumnWidths, boxWidth: number | null, withDetails: boolean): ColumnWidths {
  let list = clamp(chosen.list, LIST_WIDTH.min, LIST_WIDTH.max)
  let details = clamp(chosen.details, DETAILS_WIDTH.min, DETAILS_WIDTH.max)
  if (boxWidth === null || !Number.isFinite(boxWidth) || boxWidth <= 0) return { list, details }
  let room = boxWidth - CHAT_MIN - (withDetails ? details : 0)
  if (withDetails && list > room) {
    details = Math.max(DETAILS_WIDTH.min, details - (list - room))
    room = boxWidth - CHAT_MIN - details
  }
  if (list > room) list = Math.max(LIST_WIDTH.min, Math.floor(room))
  return { list, details }
}

// The list's width while its line is dragged `moved` pixels (right = wider), from where the drag started.
export function dragList(start: ColumnWidths, moved: number, boxWidth: number | null, withDetails: boolean) {
  const room = boxWidth ? boxWidth - CHAT_MIN - (withDetails ? start.details : 0) : LIST_WIDTH.max
  return clamp(start.list + moved, LIST_WIDTH.min, Math.max(LIST_WIDTH.min, Math.min(LIST_WIDTH.max, room)))
}

// The details panel's width while its line is dragged `moved` pixels (left = wider).
export function dragDetails(start: ColumnWidths, moved: number, boxWidth: number | null) {
  const room = boxWidth ? boxWidth - CHAT_MIN - start.list : DETAILS_WIDTH.max
  return clamp(start.details - moved, DETAILS_WIDTH.min, Math.max(DETAILS_WIDTH.min, Math.min(DETAILS_WIDTH.max, room)))
}

// What the person chose last time, on this browser. Anything missing or broken gives the defaults.
export function readColumns(storage: Pick<Storage, 'getItem'> | null): ColumnWidths {
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as Partial<ColumnWidths> | null
    return {
      list: typeof saved?.list === 'number' && Number.isFinite(saved.list) ? clamp(saved.list, LIST_WIDTH.min, LIST_WIDTH.max) : LIST_WIDTH.initial,
      details:
        typeof saved?.details === 'number' && Number.isFinite(saved.details)
          ? clamp(saved.details, DETAILS_WIDTH.min, DETAILS_WIDTH.max)
          : DETAILS_WIDTH.initial,
    }
  } catch {
    return DEFAULT_COLUMNS
  }
}

export function saveColumns(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, widths: ColumnWidths) {
  try {
    if (widths.list === DEFAULT_COLUMNS.list && widths.details === DEFAULT_COLUMNS.details) storage?.removeItem(STORAGE_KEY)
    else storage?.setItem(STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // A private window or blocked storage: the widths still work, they are just not kept.
  }
}
