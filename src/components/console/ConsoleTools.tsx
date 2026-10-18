import { useEffect, useRef, useState } from 'react'
import { Shuffle, Timer } from '@phosphor-icons/react'
import { formatClock, pickNext } from '../../lib/consoleTools'
import { StudentAvatar } from '../StudentAvatar'

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
export function TimerTool({
  onChange,
  command,
}: {
  onChange?: (timer: { endsAt: number | null; pausedLeft: number | null }) => void
  // Started from outside (the AI assistant): a new seq starts `minutes`.
  command?: { seq: number; minutes: number } | null
}) {
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

  const commandSeq = command?.seq ?? null
  const commandMinutes = command?.minutes ?? 0
  useEffect(() => {
    if (commandSeq !== null) start(commandMinutes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandSeq])

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
  command,
}: {
  candidates: number[]
  names: Map<number, string>
  onPicked: (studentId: number | null) => void
  // Picked from outside (the AI assistant): a new seq picks once.
  command?: number | null
}) {
  const [picked, setPicked] = useState<number[]>([])
  const [current, setCurrent] = useState<number | null>(null)
  // While rolling, the face on show changes quickly, then slows and stops.
  const [rolling, setRolling] = useState<number | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    if (command != null) pick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command])

  function pick() {
    const next = pickNext(candidates, picked)
    setPicked(next.picked)
    onPicked(next.studentId)
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (next.studentId === null) {
      setCurrent(null)
      return
    }
    const chosen = next.studentId
    let at = 0
    for (let step = 0; step < 14; step += 1) {
      at += 60 + step * step * 4
      const face = candidates[Math.floor(Math.random() * candidates.length)]
      timers.current.push(setTimeout(() => setRolling(face), at))
    }
    timers.current.push(
      setTimeout(() => {
        setRolling(null)
        setCurrent(chosen)
      }, at + 120),
    )
  }

  const shown = rolling ?? current
  return (
    <section aria-label="Random pick" className="rounded-2xl border border-slate-200 bg-white p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Shuffle size={16} className="text-[#fc0c97]" aria-hidden="true" />
        Random pick
      </h4>
      <div className="mt-1 flex min-h-14 items-center gap-3" aria-live="polite">
        {shown !== null && <StudentAvatar id={shown} name={names.get(shown) ?? ''} size={52} />}
        <p className={`truncate text-3xl font-semibold ${rolling !== null ? 'text-slate-400' : 'text-slate-900'}`}>
          {shown !== null ? (names.get(shown) ?? `Student ${shown}`) : '—'}
        </p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {candidates.length === 0 ? 'Nobody to pick.' : `${Math.min(picked.length, candidates.length)} of ${candidates.length} picked this round`}
        </span>
        <button
          type="button"
          disabled={candidates.length === 0 || rolling !== null}
          onClick={pick}
          className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
        >
          Pick
        </button>
      </div>
    </section>
  )
}
