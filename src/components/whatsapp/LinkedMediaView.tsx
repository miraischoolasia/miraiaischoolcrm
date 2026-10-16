import { useState } from 'react'
import { FileText } from '@phosphor-icons/react'
import type { LinkedMedia } from '../../lib/linkedMedia'
import { WaveformPlayer } from './WaveformPlayer'

function seedOf(url: string) {
  let total = 0
  for (const letter of url) {
    total = (total * 31 + letter.charCodeAt(0)) % 100000
  }
  return total
}

function fileNameOf(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'file')
  } catch {
    return 'file'
  }
}

// A video link that has no picture in it is a voice message (Messenger sends those as audio-only .mp4).
function VideoOrVoice({ url }: { url: string }) {
  const [voice, setVoice] = useState(false)
  if (voice) {
    return <WaveformPlayer src={url} seed={seedOf(url)} />
  }
  return (
    <video
      controls
      preload="metadata"
      src={url}
      onLoadedMetadata={(event) => {
        if (event.currentTarget.videoWidth === 0) {
          setVoice(true)
        }
      }}
      className="max-h-64 max-w-full rounded-lg"
    />
  )
}

// A link to a file, shown as the file: the picture, a voice player, a video or a download link.
export function LinkedMediaView({ item }: { item: LinkedMedia }) {
  if (item.kind === 'image') {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer">
        <img src={item.url} alt="Photo" loading="lazy" className="max-h-64 max-w-full rounded-lg object-cover" />
      </a>
    )
  }
  if (item.kind === 'audio') {
    return <WaveformPlayer src={item.url} seed={seedOf(item.url)} />
  }
  if (item.kind === 'video') {
    return <VideoOrVoice url={item.url} />
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-sm text-slate-700 hover:bg-black/10"
    >
      <FileText size={18} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{fileNameOf(item.url)}</span>
    </a>
  )
}
