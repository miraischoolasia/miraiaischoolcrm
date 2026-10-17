import { useEffect, useRef } from 'react'

import { playerCommand, playerUrl, readPlayerMessage, saveVideoProgress, type ClassVideo } from '@/lib/videos'

const SAVE_EVERY_SECONDS = 20

// On the web the video plays in the page (Bunny's player in a frame); how far
// the child got is saved every 20 seconds of watching and when it ends.
export function VideoPlayer({ studentId, video, onProgress }: { studentId: number; video: ClassVideo; onProgress: () => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  // Kept out of the effect's inputs: a refreshed list must not count a second view.
  const latest = useRef({ watched: video.watched, onProgress })
  latest.current = { watched: video.watched, onProgress }

  useEffect(() => {
    let furthest = 0
    let duration = 0
    let lastSaved = 0
    void saveVideoProgress(studentId, video.id, latest.current.watched, 0, true)

    const save = () => {
      if (duration <= 0 || furthest <= lastSaved) return
      lastSaved = furthest
      void saveVideoProgress(studentId, video.id, (furthest / duration) * 100, furthest).then(() => latest.current.onProgress())
    }
    const listen = (message: MessageEvent) => {
      if (message.source !== frame.current?.contentWindow) return
      const event = readPlayerMessage(message.data)
      if (!event) return
      if (event.event === 'ready') {
        for (const name of ['timeupdate', 'ended']) {
          frame.current?.contentWindow?.postMessage(playerCommand('addEventListener', name), '*')
        }
      } else if (event.event === 'timeupdate') {
        if (event.duration) duration = event.duration
        if (event.seconds !== undefined) furthest = Math.max(furthest, event.seconds)
        if (furthest - lastSaved >= SAVE_EVERY_SECONDS) save()
      } else if (event.event === 'ended') {
        if (duration > 0) furthest = duration
        save()
      }
    }
    window.addEventListener('message', listen)
    return () => {
      window.removeEventListener('message', listen)
      save()
    }
  }, [studentId, video.id])

  return (
    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
      <iframe
        ref={frame}
        title={video.title}
        src={`${playerUrl(video.embed_url)}?autoplay=true&preload=true`}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )
}
