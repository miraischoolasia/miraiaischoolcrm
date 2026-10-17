import * as WebBrowser from 'expo-web-browser'
import { useEffect, useRef } from 'react'

import { saveVideoProgress, type ClassVideo } from '@/lib/videos'
import { useSession } from '@/lib/session'
import { Button, Muted } from '@/ui/kit'

// On a phone the video opens in Bunny's own player (an in-app browser); the
// view is counted, but how far the child watched is only known on the web.
export function VideoPlayer({ studentId, video, onProgress }: { studentId: number; video: ClassVideo; onProgress: () => void }) {
  const { branding } = useSession()
  // Kept out of the effect's inputs: a refreshed list must not count a second view.
  const latest = useRef({ watched: video.watched, onProgress })
  latest.current = { watched: video.watched, onProgress }
  useEffect(() => {
    void saveVideoProgress(studentId, video.id, latest.current.watched, 0, true).then(() => latest.current.onProgress())
  }, [studentId, video.id])
  return (
    <>
      <Button label="Play the video" color={branding.accentColor} onPress={() => void WebBrowser.openBrowserAsync(video.embed_url)} />
      <Muted>The video opens in the player.</Muted>
    </>
  )
}
