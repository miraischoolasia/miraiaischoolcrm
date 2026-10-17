import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { formatDuration, loadPeaks, pseudoPeaks } from '../../lib/waveform'

type WaveformPlayerProps = {
  src: string
  // Keeps the bars steady when the real sound can't be read.
  seed: number
  className?: string
}

// A voice message as a round play button and a row of sound bars that fill in
// as it plays. Tapping the bars jumps to that spot.
export function WaveformPlayer({ src, seed, className }: WaveformPlayerProps) {
  const fallback = useMemo(() => pseudoPeaks(seed), [seed])
  const [peaks, setPeaks] = useState<number[]>(fallback)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let cancelled = false
    loadPeaks(src)
      .then((result) => {
        if (!cancelled) {
          setPeaks(result.peaks)
          setDuration(result.duration)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPeaks(fallback)
        }
      })
    return () => {
      cancelled = true
    }
  }, [src, fallback])

  const progress = duration > 0 ? current / duration : 0

  function toggle() {
    const element = audio.current
    if (!element) {
      return
    }
    if (element.paused) {
      void element.play()
    } else {
      element.pause()
    }
  }

  function seek(event: React.MouseEvent<HTMLDivElement>) {
    const element = audio.current
    if (!element || duration <= 0) {
      return
    }
    const box = event.currentTarget.getBoundingClientRect()
    element.currentTime = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * duration
    setCurrent(element.currentTime)
  }

  return (
    <div className={cn('flex w-[230px] max-w-full items-center gap-2', className)}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const length = event.currentTarget.duration
          if (Number.isFinite(length) && length > 0) {
            setDuration(length)
          }
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrent(0)
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
      >
        {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
      </button>
      <div
        onClick={seek}
        role="presentation"
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between"
      >
        {peaks.map((peak, index) => (
          <span
            key={index}
            style={{ height: `${Math.round(peak * 100)}%` }}
            className={cn(
              'w-[3px] shrink-0 rounded-full',
              index / peaks.length < progress ? 'bg-emerald-600' : 'bg-slate-300',
            )}
          />
        ))}
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
        {formatDuration(playing || current > 0 ? current : duration)}
      </span>
    </div>
  )
}
