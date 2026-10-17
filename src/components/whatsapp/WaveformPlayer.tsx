import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { formatDuration, loadPeaks, pseudoPeaks } from '../../lib/waveform'

// Like WhatsApp: the speed button goes 1x, 1.5x, 2x and round again, and the choice is kept for the next voice message.
const SPEEDS = [1, 1.5, 2]
const SPEED_KEY = 'whatsapp-voice-speed'

function readSpeed() {
  try {
    const saved = Number(window.localStorage.getItem(SPEED_KEY))
    return SPEEDS.includes(saved) ? saved : 1
  } catch {
    return 1
  }
}

function writeSpeed(speed: number) {
  try {
    window.localStorage.setItem(SPEED_KEY, String(speed))
  } catch {
    // Private windows can refuse storage; the speed just is not remembered.
  }
}

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
  const [speed, setSpeed] = useState(readSpeed)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (audio.current) {
      audio.current.playbackRate = speed
    }
  }, [speed, src])

  function changeSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    writeSpeed(next)
  }

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
    <div className={cn('flex w-[270px] max-w-full items-center gap-2', className)}>
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
        onPlay={(event) => {
          // Some browsers go back to normal speed when a new play starts.
          event.currentTarget.playbackRate = speed
          setPlaying(true)
        }}
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
      <button
        type="button"
        onClick={changeSpeed}
        aria-label={`Playback speed ${speed}x. Press to change`}
        title="Playback speed"
        className={cn(
          'w-9 shrink-0 rounded-full border px-1 py-0.5 text-[11px] font-semibold tabular-nums',
          speed === 1 ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-emerald-600 bg-emerald-600 text-white',
        )}
      >
        {speed}x
      </button>
    </div>
  )
}
