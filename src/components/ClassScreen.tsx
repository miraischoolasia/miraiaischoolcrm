import { useEffect, useState } from 'react'
import { classScreenChannel, readClassScreenState, type ClassScreenState } from '../lib/classScreen'
import { formatClock } from '../lib/consoleTools'
import { brand } from '../lib/brand'

const medals = ['🥇', '🥈', '🥉', '4', '5']

// /?screen=<timetable entry>&date=<day>: the big window the teacher shares in
// Zoom. It only shows what the live class console sends it (same computer);
// it reads nothing from the server and needs no login.
export function ClassScreen({ scheduleId, lessonDate }: { scheduleId: number; lessonDate: string }) {
  const [state, setState] = useState<ClassScreenState | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(classScreenChannel(scheduleId, lessonDate))
    channel.onmessage = (event) => {
      const next = readClassScreenState(event.data)
      if (next) setState(next)
    }
    channel.postMessage({ hello: true })
    return () => channel.close()
  }, [lessonDate, scheduleId])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    document.title = state?.title ? `${state.title} · class screen` : 'Class screen'
  }, [state?.title])

  const lost = state !== null && now - state.sentAt > 8000
  const left =
    state?.timer.endsAt != null ? Math.max(0, (state.timer.endsAt - now) / 1000) : (state?.timer.pausedLeft ?? null)
  const questionLeft = state?.question ? Math.max(0, (Date.parse(state.question.closesAt) - now) / 1000) : null

  return (
    <main className="flex min-h-screen flex-col bg-[#fff7fb] p-8 text-slate-900">
      <header className="flex items-center justify-between">
        <p className="text-2xl font-semibold text-[#be185d]">{brand.name}</p>
        <p className="text-2xl font-semibold">{state?.title ?? ''}</p>
      </header>

      {state === null ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <p className="max-w-xl text-2xl text-slate-500">Keep the live class console open in the other window. This screen shows what you send from it.</p>
        </div>
      ) : (
        <div className="grid flex-1 gap-6 pt-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="flex flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-sm">
            {state.question && questionLeft !== null && questionLeft > 0 ? (
              <>
                <p className="text-2xl font-semibold text-[#be185d]">Question {state.question.number}</p>
                <p className="mt-4 text-5xl font-semibold leading-tight">{state.question.prompt}</p>
                <p className="mt-6 text-3xl text-slate-500">Answer in the app · {formatClock(Math.ceil(questionLeft))}</p>
              </>
            ) : left !== null ? (
              <>
                <p className="text-2xl font-semibold text-slate-500">Time left</p>
                <p className={`text-[10rem] font-bold leading-none tabular-nums ${left === 0 ? 'text-rose-600' : ''}`}>
                  {left === 0 ? "Time's up!" : formatClock(Math.ceil(left))}
                </p>
              </>
            ) : state.picked ? (
              <>
                <p className="text-3xl font-semibold text-slate-500">Your turn</p>
                <p className="mt-4 text-8xl font-bold text-[#be185d]">{state.picked}</p>
              </>
            ) : (
              <p className="text-5xl font-semibold text-slate-400">Welcome to class!</p>
            )}
          </section>
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-2xl font-semibold">Top of the class</p>
            {state.top.length === 0 ? (
              <p className="mt-4 text-xl text-slate-400">Answer questions to get on the board.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {state.top.map((row, index) => (
                  <li key={`${row.name}-${index}`} className="flex items-center justify-between text-3xl">
                    <span>
                      {medals[index] ?? index + 1} {row.name}
                    </span>
                    <span className="font-semibold text-amber-600">⭐ {row.points}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
      {state?.cheer && !lost && (
        <div key={state.cheer.id} className="pointer-events-none fixed inset-0 flex items-center justify-center" aria-live="polite">
          <div className="animate-bounce rounded-3xl border-4 border-amber-400 bg-white px-12 py-8 text-center shadow-2xl">
            <p className="text-7xl">🎉</p>
            <p className="mt-2 text-5xl font-bold text-[#be185d]">
              {state.cheer.name} +{state.cheer.points} ⭐
            </p>
            {state.cheer.reason && <p className="mt-2 text-3xl font-semibold text-slate-700">{state.cheer.reason}</p>}
          </div>
        </div>
      )}
      {lost && <p className="pt-4 text-center text-lg text-slate-400">Waiting for the console…</p>}
    </main>
  )
}
