import { useEffect, useRef, useState } from 'react'
import { classScreenChannel, readClassScreenState, type ClassScreenState } from '../lib/classScreen'
import { formatClock } from '../lib/consoleTools'
import { brand } from '../lib/brand'
import { StudentAvatar } from './StudentAvatar'

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
            ) : state.teams && state.teams.length > 0 ? (
              <TeamsBoard teams={state.teams} />
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
      {state?.roll && now - state.roll.seq < 15000 && <RollShow key={state.roll.seq} roll={state.roll} />}
      {state?.star && <StarStage key={state.star.seq} star={state.star} />}
      {lost && <p className="pt-4 text-center text-lg text-slate-400">Waiting for the console…</p>}
    </main>
  )
}

// Moving pieces of the class screen (only CSS, no extra library).
const screenKeyframes = `
@keyframes cs-pop { 0% { transform: scale(0.3); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
@keyframes cs-float { 0% { transform: translateY(0) rotate(0deg); opacity: 1 } 100% { transform: translateY(-60vh) rotate(260deg); opacity: 0 } }
@keyframes cs-sway { 0%, 100% { transform: rotate(-4deg) } 50% { transform: rotate(4deg) } }
@keyframes cs-glow { 0%, 100% { opacity: 0.55 } 50% { opacity: 0.85 } }
`

const confetti = ['🎉', '⭐', '✨', '🎊', '🌟', '💫', '🎈', '⭐']

function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {confetti.concat(confetti).map((piece, index) => (
        <span
          key={index}
          className="absolute text-5xl"
          style={{
            left: `${(index * 61) % 100}%`,
            bottom: '-3rem',
            animation: `cs-float ${2.2 + (index % 5) * 0.35}s ease-out ${(index % 7) * 0.12}s forwards`,
          }}
        >
          {piece}
        </span>
      ))}
    </div>
  )
}

// Random pick: 3, 2, 1, then faces roll by fast, slow down and stop on the
// child picked, who pops up big with confetti.
function RollShow({ roll }: { roll: NonNullable<ClassScreenState['roll']> }) {
  const [phase, setPhase] = useState<'count' | 'roll' | 'done'>('count')
  const [count, setCount] = useState(3)
  const [face, setFace] = useState(roll.people[0] ?? null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  // The console sends the same pick again every 2 seconds: the show runs once per pick.
  const first = useRef(roll)

  useEffect(() => {
    const roll = first.current
    const later = (ms: number, run: () => void) => timers.current.push(setTimeout(run, ms))
    later(700, () => setCount(2))
    later(1400, () => setCount(1))
    later(2100, () => setPhase('roll'))
    let at = 2100
    const people = roll.people.length > 0 ? roll.people : [{ id: roll.chosenId, name: '' }]
    for (let step = 0; step < 22; step += 1) {
      at += 55 + step * step * 1.6
      const next = people[Math.floor(Math.random() * people.length)]
      later(at, () => setFace(next))
    }
    later(at + 150, () => setPhase('done'))
    const list = timers.current
    return () => list.forEach(clearTimeout)
  }, [])

  const chosen = roll.people.find((person) => person.id === roll.chosenId) ?? { id: roll.chosenId, name: '' }
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-indigo-950/95 text-white" aria-live="polite">
      <style>{screenKeyframes}</style>
      {phase === 'count' ? (
        <p key={count} className="text-[14rem] font-black" style={{ animation: 'cs-pop 0.6s ease-out' }}>
          {count}
        </p>
      ) : phase === 'roll' && face ? (
        <div className="flex flex-col items-center gap-4 opacity-80">
          <StudentAvatar id={face.id} name={face.name} size={220} />
          <p className="text-6xl font-bold">{face.name}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-5" style={{ animation: 'cs-pop 0.7s ease-out' }}>
            <div className="rounded-full bg-amber-300 p-3 shadow-[0_0_80px_rgba(252,211,77,0.7)]">
              <StudentAvatar id={chosen.id} name={chosen.name} size={260} />
            </div>
            <p className="text-8xl font-black text-amber-300">{chosen.name}</p>
            <p className="text-4xl font-semibold">It's your turn!</p>
          </div>
          <Confetti />
        </>
      )}
    </div>
  )
}

// Star of the day: a stage with curtains and a spotlight on the child.
function StarStage({ star }: { star: NonNullable<ClassScreenState['star']> }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden text-white"
      style={{ background: 'repeating-linear-gradient(90deg, #7f1d1d 0 38px, #991b1b 38px 76px)' }}
      aria-live="polite"
    >
      <style>{screenKeyframes}</style>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-full"
        style={{
          background: 'radial-gradient(ellipse 32% 70% at 50% 58%, rgba(254,243,199,0.85), rgba(254,243,199,0) 70%)',
          animation: 'cs-glow 2.4s ease-in-out infinite',
        }}
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-16 bg-[repeating-linear-gradient(90deg,#b91c1c_0_30px,#dc2626_30px_60px)] shadow-lg" />
      <div className="relative flex flex-col items-center gap-4" style={{ animation: 'cs-pop 0.8s ease-out' }}>
        <p className="text-5xl font-black tracking-wide text-amber-300" style={{ animation: 'cs-sway 2s ease-in-out infinite' }}>
          ⭐ Star of the day ⭐
        </p>
        <div className="rounded-full bg-white p-3 shadow-2xl">
          <StudentAvatar id={star.id} name={star.name} size={260} />
        </div>
        <p className="rounded-full bg-amber-300 px-10 py-2 text-7xl font-black text-red-900">{star.name}</p>
      </div>
      <div aria-hidden="true" className="absolute bottom-0 h-24 w-full bg-amber-900" />
      <Confetti />
    </div>
  )
}

// Teams on the big panel: one coloured card each, with faces and the points.
function TeamsBoard({ teams }: { teams: NonNullable<ClassScreenState['teams']> }) {
  return (
    <div className="grid w-full gap-4" style={{ gridTemplateColumns: `repeat(${teams.length > 4 ? 3 : 2}, minmax(0, 1fr))` }}>
      {teams.map((team) => (
        <div key={team.key} className="rounded-3xl p-4 text-left" style={{ background: team.color, color: team.text }}>
          <div className="flex items-center justify-between text-3xl font-black">
            <span>{team.label}</span>
            <span>⭐ {team.score}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.members.map((member) => (
              <span key={member.id} className="flex items-center gap-1.5 rounded-full bg-white/90 py-1 pl-1 pr-3 text-xl font-semibold text-slate-800">
                <StudentAvatar id={member.id} name={member.name} size={34} />
                {member.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
