import { useCallback, useEffect, useRef, useState } from 'react'
import { drawingProgress, fetchImages, kickDrawing, type ContentImage } from '../lib/contentImages'
import { signedUrls } from '../lib/contentStudio'

// How often the page looks for finished pictures while some are being drawn, and how often it nudges the
// drawing function in case its own hand-over was lost.
const CHECK_EVERY_MS = 4000
const NUDGE_EVERY_MS = 45000

// The pictures of these posts, kept up to date while any is being drawn. `onAllDone` runs once each time
// the last waiting picture finishes (to tell the team).
export function useContentImages(itemIds: number[], onAllDone?: (summary: { done: number; failed: number }) => void) {
  const [images, setImages] = useState<ContentImage[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const urlsRef = useRef(urls)
  const key = itemIds.join(',')
  const wasWaiting = useRef(false)
  const lastNudge = useRef(0)
  const doneRef = useRef(onAllDone)
  doneRef.current = onAllDone

  const refresh = useCallback(async () => {
    const ids = key ? key.split(',').map(Number) : []
    const rows = await fetchImages(ids).catch(() => null)
    if (!rows) return
    setImages(rows)
    const wanted = rows
      .filter((row) => row.status === 'done' && row.path && !urlsRef.current.has(row.path))
      .map((row) => row.path as string)
    if (wanted.length > 0) {
      const found = await signedUrls(wanted).catch(() => null)
      if (found) {
        urlsRef.current = new Map([...urlsRef.current, ...found])
        setUrls(urlsRef.current)
      }
    }
    const progress = drawingProgress(rows)
    if (progress.waiting > 0) {
      wasWaiting.current = true
      if (Date.now() - lastNudge.current > NUDGE_EVERY_MS) {
        lastNudge.current = Date.now()
        if (rows.some((row) => row.status === 'queued')) void kickDrawing()
      }
    } else if (wasWaiting.current) {
      wasWaiting.current = false
      doneRef.current?.({ done: progress.done, failed: progress.failed })
    }
  }, [key])

  useEffect(() => {
    lastNudge.current = Date.now()
    void refresh()
  }, [refresh])

  const waiting = drawingProgress(images).waiting
  useEffect(() => {
    if (waiting === 0) return
    const timer = window.setInterval(() => void refresh(), CHECK_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [waiting, refresh])

  return { images, urls, refresh, progress: drawingProgress(images) }
}

// Asks once whether the browser may show a notice when pictures are ready (only after a click).
export function askToNotify() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
  } catch {
    // Some browsers do not allow it; the page notice is enough.
  }
}

export function notifyPicturesReady(text: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification('Pictures ready', { body: text })
    }
  } catch {
    // The page notice still shows.
  }
}
