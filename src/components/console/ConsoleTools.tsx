import { useEffect, useRef, useState } from 'react'
import { Shuffle, Timer } from '@phosphor-icons/react'
import { formatClock, pickNext } from '../../lib/consoleTools'

const timerChoices = [1, 3, 5, 10]

function beep() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const audio = new AudioContextClass()
    for (const [index, at] of [0, 0.35, 0.7].entries()) {
      const tone = audio.createOscillator()
      const volume = audio.createGain()
      tone.frequency.value = index === 2 ? 1046 : 880
      volume.gain.value = 0.15
      tone.connect(volume).connect(audio.destination)
      tone.start(audio.currentTime + at)
      tone.stop(audio.currentTime + at + 0.25)
    }
    setTimeout(() => void audio.close(), 1500)
  } catch {
    // no sound is fine
  }
}

// A countdown for class work. It beeps when time is up; the class screen
// shows it too.
export function TimerTool({ onChange }: { onChange?: (timer: { endsAt: number | null; pausedLeft: number | null }) => void }) {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [pausedLeft, setPausedLeft] = useState<number | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    onChangeRef.current?.({ endsAt, pausedLeft })
  }, [endsAt, pausedLeft])
  useEffect(() => () => onChangeRef.current?.({ endsAt: null, pausedLeft: null }), [])
  const [now, setNow] = useState(() => Date.now())
  const rang = useRef(false)

  useEffect(() => {
    if (endsAt === null) return
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [endsAt])

  const left = endsAt !== null ? Math.max(0, (endsAt - now) / 1000) : pausedLeft
  useEffect(() => {
    if (endsAt !== null && left === 0 && !rang.current) {
      rang.current = true
      beep()
    }
  }, [endsAt, left])

  function start(minutes: number) {
    rang.current = false
    setPausedLeft(null)
    setNow(Date.now())
    setEndsAt(Date.now() + minutes * 60_000)
  }

  return (
    <section aria-label="Timer" className="rounded-2xl border border-slate-200 bg-white p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Timer size={16} className="text-sky-600" aria-hidden="true" />
        Timer
      </h4>
      <p className={`mt-1 text-4xl font-semibold tabular-nums ${left === 0 ? 'text-rose-600' : 'text-slate-900'}`} aria-live="polite">
        {left === null ? '0:00' : left === 0 ? "Time's up" : formatClock(Math.ceil(left))}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {timerChoices.map((minutes) => (
          <button key={minutes} type="button" onClick={() => start(minutes)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {minutes} min
          </button>
        ))}
        {endsAt !== null && left !== 0 && (
          <button
            type="button"
            onClick={() => {
              setPausedLeft(left)
              setEndsAt(null)
            }}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Pause
          </button>
        )}
        {endsAt === null && pausedLeft !== null && pausedLeft > 0 && (
          <button
            type="button"
            onClick={() => {
              setNow(Date.now())
              setEndsAt(Date.now() + pausedLeft * 1000)
              setPausedLeft(null)
            }}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Go on
          </button>
        )}
        {(endsAt !== null || pausedLeft !== null) && (
          <button
            type="button"
            onClick={() => {
              setEndsAt(null)
              setPausedLeft(null)
            }}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>
    </section>
  )
}

// Picks a child to answer: from those in Zoom now (everyone in the lesson when
// nobody is), each once before anyone is picked again.
export function RandomPickTool({
  candidates,
  names,
  onPicked,
}: {
  candidates: number[]
  names: Map<number, string>
  onPicked: (studentId: number | null) => void
}) {
  const [picked, setPicked] = useState<number[]>([])
  const [current, setCurrent] = useState<number | null>(null)

  function pick() {
    const next = pickNext(candidates, picked)
    setPicked(next.picked)
    setCurrent(next.studentId)
    onPicked(next.studentId)
  }

  return (
    <section aria-label="Random pick" className="rounded-2xl border border-slate-200 bg-white p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Shuffle size={16} className="text-[#fc0c97]" aria-hidden="true" />
        Random pick
      </h4>
      <p className="mt-1 min-h-10 truncate text-3xl font-semibold text-slate-900" aria-live="polite">
        {current !== null ? (names.get(current) ?? `Student ${current}`) : '—'}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {candidates.length === 0 ? 'Nobody to pick.' : `${Math.min(picked.length, candidates.length)} of ${candidates.length} picked this round`}
        </span>
        <button
          type="button"
          disabled={candidates.length === 0}
          onClick={pick}
          className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
        >
          Pick
        </button>
      </div>
    </section>
  )
}
