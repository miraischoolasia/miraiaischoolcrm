import { useEffect, useRef, useState, type CSSProperties } from 'react'

import type { ClassLiveState } from '@/lib/classRoom'
import { StudentAvatar } from '@/ui/StudentAvatar'

// What the teacher's live class console shows the class, over the child's
// Zoom: random pick, star of the day and cheers as full-page moments; the
// timer, the child picked to answer and the teams in a small bar. A copy of
// the CRM class screen's pieces (src/components/ClassScreen.tsx), sized for a
// phone as well as a laptop. Web only (ClassEffects.tsx on phones).

const keyframes = `
@keyframes ce-pop { 0% { transform: scale(0.3); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
@keyframes ce-float { 0% { transform: translateY(0) rotate(0deg); opacity: 1 } 100% { transform: translateY(-70vh) rotate(260deg); opacity: 0 } }
@keyframes ce-sway { 0%, 100% { transform: rotate(-4deg) } 50% { transform: rotate(4deg) } }
@keyframes ce-glow { 0%, 100% { opacity: 0.55 } 50% { opacity: 0.85 } }
@keyframes ce-bounce { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
`

// The app's own font for these page-wide moments (plain page elements do not get it).
const font = "Nunito, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"
const fill: CSSProperties = { position: 'fixed', inset: 0, zIndex: 50, fontFamily: font }

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// How long "<name>'s turn" stays in the top bar after a pick.
export const pickedSeconds = 10

const confetti = ['🎉', '⭐', '✨', '🎊', '🌟', '💫', '🎈', '⭐']

function Confetti() {
  return (
    <div aria-hidden="true" style={{ ...fill, pointerEvents: 'none', overflow: 'hidden' }}>
      {confetti.concat(confetti).map((piece, index) => (
        <span
          key={index}
          style={{
            position: 'absolute',
            fontSize: 'min(9vmin, 48px)',
            left: `${(index * 61) % 100}%`,
            bottom: '-3rem',
            animation: `ce-float ${2.2 + (index % 5) * 0.35}s ease-out ${(index % 7) * 0.12}s forwards`,
          }}
        >
          {piece}
        </span>
      ))}
    </div>
  )
}

// A big face that still fits a phone: at most 46% of the shorter side.
function Avatar({ id, name, size }: { id: number; name: string; size: number }) {
  const fits = Math.round(Math.min(size, 0.46 * Math.min(window.innerWidth, window.innerHeight)))
  return <StudentAvatar id={id} name={name} size={fits} />
}

// Random pick: 3, 2, 1, faces roll by and stop on the child picked.
function RollShow({ roll, myId }: { roll: NonNullable<ClassLiveState['roll']>; myId: number }) {
  const [phase, setPhase] = useState<'count' | 'roll' | 'done'>('count')
  const [count, setCount] = useState(3)
  const [current, setCurrent] = useState(roll.people[0] ?? null)
  const first = useRef(roll)

  useEffect(() => {
    const show = first.current
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (ms: number, run: () => void) => timers.push(setTimeout(run, ms))
    later(700, () => setCount(2))
    later(1400, () => setCount(1))
    later(2100, () => setPhase('roll'))
    let at = 2100
    const people = show.people.length > 0 ? show.people : [{ id: show.chosenId, name: '' }]
    for (let step = 0; step < 22; step += 1) {
      at += 55 + step * step * 1.6
      const next = people[Math.floor(Math.random() * people.length)]
      later(at, () => setCurrent(next))
    }
    later(at + 150, () => setPhase('done'))
    return () => timers.forEach(clearTimeout)
  }, [])

  const chosen = roll.people.find((person) => person.id === roll.chosenId) ?? { id: roll.chosenId, name: '' }
  const isMe = chosen.id === myId
  return (
    <div
      style={{ ...fill, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,27,75,0.72)', color: '#fff', textAlign: 'center', padding: 16 }}
      aria-live="polite"
    >
      {phase === 'count' ? (
        <p key={count} style={{ fontSize: 'min(40vmin, 14rem)', fontWeight: 900, margin: 0, animation: 'ce-pop 0.6s ease-out' }}>
          {count}
        </p>
      ) : phase === 'roll' && current ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: 0.8 }}>
          <Avatar id={current.id} name={current.name} size={220} />
          <p style={{ fontSize: 'min(10vmin, 3.75rem)', fontWeight: 700, margin: 0 }}>{current.name}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: 'ce-pop 0.7s ease-out' }}>
            <div style={{ borderRadius: '50%', background: '#fcd34d', padding: 10, boxShadow: '0 0 80px rgba(252,211,77,0.7)' }}>
              <Avatar id={chosen.id} name={chosen.name} size={260} />
            </div>
            <p style={{ fontSize: 'min(13vmin, 6rem)', fontWeight: 900, color: '#fcd34d', margin: 0 }}>{chosen.name}</p>
            <p style={{ fontSize: 'min(7vmin, 2.25rem)', fontWeight: 700, margin: 0 }}>{isMe ? "It's your turn!" : `${chosen.name}'s turn!`}</p>
          </div>
          <Confetti />
        </>
      )}
    </div>
  )
}

// Star of the day: a small stage with curtains and a spotlight on the child,
// in the middle over a see-through shade.
function StarStage({ star }: { star: NonNullable<ClassLiveState['star']> }) {
  return (
    <div style={{ ...fill, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(20,10,40,0.6)' }} aria-live="polite">
    <div
      style={{
        position: 'relative',
        width: 'min(92vw, 760px)',
        height: 'min(84vh, 640px)',
        borderRadius: 24,
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        color: '#fff',
        background: 'repeating-linear-gradient(90deg, #7f1d1d 0 38px, #991b1b 38px 76px)',
        animation: 'ce-pop 0.5s ease-out',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 40% 70% at 50% 58%, rgba(254,243,199,0.85), rgba(254,243,199,0) 70%)',
          animation: 'ce-glow 2.4s ease-in-out infinite',
        }}
      />
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 56, background: 'repeating-linear-gradient(90deg,#b91c1c 0 30px,#dc2626 30px 60px)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, animation: 'ce-pop 0.8s ease-out', padding: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 'min(9vmin, 3rem)', fontWeight: 900, color: '#fcd34d', margin: 0, animation: 'ce-sway 2s ease-in-out infinite' }}>
          ⭐ Star of the day ⭐
        </p>
        <div style={{ borderRadius: '50%', background: '#fff', padding: 10 }}>
          <Avatar id={star.id} name={star.name} size={260} />
        </div>
        <p style={{ borderRadius: 999, background: '#fcd34d', padding: '6px 32px', fontSize: 'min(12vmin, 4.5rem)', fontWeight: 900, color: '#7f1d1d', margin: 0 }}>
          {star.name}
        </p>
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 0, height: 72, width: '100%', background: '#78350f' }} />
    </div>
      <Confetti />
    </div>
  )
}

// New teams: which team the child is in, in the middle for a few seconds.
function TeamsPop({ teams, myId }: { teams: NonNullable<ClassLiveState['teams']>; myId: number }) {
  const mine = teams.find((team) => team.members.some((member) => member.id === myId)) ?? null
  return (
    <div style={{ ...fill, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,18,41,0.6)' }} aria-live="polite">
      <div
        style={{
          width: 'min(92vw, 640px)',
          borderRadius: 24,
          background: '#fff',
          padding: '24px 28px',
          textAlign: 'center',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
          animation: 'ce-pop 0.5s ease-out',
        }}
      >
        <p style={{ fontSize: 'min(8vmin, 2.5rem)', fontWeight: 900, margin: 0, color: '#1e1b4b' }}>👥 Teams are ready!</p>
        {mine && (
          <p style={{ display: 'inline-block', margin: '14px 0 6px', padding: '8px 24px', borderRadius: 999, fontSize: 'min(9vmin, 3rem)', fontWeight: 900, background: mine.color, color: mine.text }}>
            You are in {mine.label}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          {teams.map((team) => (
            <span key={team.key} style={{ borderRadius: 999, padding: '6px 14px', fontSize: 16, fontWeight: 800, background: team.color, color: team.text }}>
              {team.label} · {team.members.length}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// Points the teacher just gave someone in class, cheered for a moment.
function Cheer({ cheer }: { cheer: NonNullable<ClassLiveState['cheer']> }) {
  return (
    <div style={{ ...fill, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} aria-live="polite">
      <div
        style={{
          animation: 'ce-pop 0.5s ease-out, ce-bounce 1s ease-in-out 0.5s infinite',
          borderRadius: 24,
          border: '4px solid #fbbf24',
          background: '#fff',
          padding: '20px 36px',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        <p style={{ fontSize: 'min(14vmin, 4.5rem)', margin: 0 }}>🎉</p>
        <p style={{ fontSize: 'min(9vmin, 3rem)', fontWeight: 800, color: '#be185d', margin: '6px 0 0' }}>
          {cheer.name} +{cheer.points} ⭐
        </p>
        {cheer.reason && <p style={{ fontSize: 'min(6vmin, 1.75rem)', fontWeight: 600, color: '#334155', margin: '4px 0 0' }}>{cheer.reason}</p>}
      </div>
    </div>
  )
}

// Full-page moments. Each pick, star and cheer plays once, even though the
// console sends its state again every minute.
export function ClassMoments({ state, clockOffset, myId }: { state: ClassLiveState | null; clockOffset: number; myId: number }) {
  const [now, setNow] = useState(() => Date.now())
  const [cheer, setCheer] = useState<ClassLiveState['cheer']>(null)
  const seenCheers = useRef(new Set<number>())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(tick)
  }, [])

  // Each cheer shows for 4 s, whatever the console sends meanwhile.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const list = timers.current
    return () => list.forEach(clearTimeout)
  }, [])
  const incoming = state?.cheer ?? null
  useEffect(() => {
    if (!incoming || seenCheers.current.has(incoming.id)) return
    seenCheers.current.add(incoming.id)
    // The child who got them sees their own points pop-up, not this as well.
    if (incoming.studentId === myId) return
    const shown = incoming
    timers.current.push(setTimeout(() => setCheer(shown), 0))
    timers.current.push(setTimeout(() => setCheer((current) => (current?.id === shown.id ? null : current)), 4000))
  }, [incoming, myId])

  // A star shows for 10 s, once; new teams for 5 s.
  const [star, setStar] = useState<ClassLiveState['star']>(null)
  const seenStars = useRef(new Set<number>())
  const incomingStar = state?.star ?? null
  useEffect(() => {
    if (!incomingStar || seenStars.current.has(incomingStar.seq)) return
    seenStars.current.add(incomingStar.seq)
    const shown = incomingStar
    timers.current.push(setTimeout(() => setStar(shown), 0))
    timers.current.push(setTimeout(() => setStar((current) => (current?.seq === shown.seq ? null : current)), 10_000))
  }, [incomingStar])
  const [teamsShown, setTeamsShown] = useState<{ sign: string; teams: NonNullable<ClassLiveState['teams']> } | null>(null)
  const lastTeams = useRef('')
  const teams = state?.teams ?? null
  const teamsSign = teams && teams.length > 0 ? teams.map((team) => `${team.key}:${team.members.map((member) => member.id).join(',')}`).join('|') : ''
  useEffect(() => {
    if (!teams || !teamsSign || teamsSign === lastTeams.current) return
    lastTeams.current = teamsSign
    const shown = { sign: teamsSign, teams }
    timers.current.push(setTimeout(() => setTeamsShown(shown), 0))
    timers.current.push(setTimeout(() => setTeamsShown((current) => (current?.sign === shown.sign ? null : current)), 5_000))
  }, [teams, teamsSign])

  // The teacher's pick time on this device's clock; a pick shows for 15 s.
  const rollFresh = state?.roll && now - (state.roll.seq + clockOffset) < 15_000
  return (
    <>
      <style>{keyframes}</style>
      {star ? (
        <StarStage key={star.seq} star={star} />
      ) : rollFresh && state?.roll ? (
        <RollShow key={state.roll.seq} roll={state.roll} myId={myId} />
      ) : teamsShown ? (
        <TeamsPop key={teamsShown.sign} teams={teamsShown.teams} myId={myId} />
      ) : null}
      {cheer && <Cheer key={cheer.id} cheer={cheer} />}
    </>
  )
}

// The small bar under the video: the timer, who is answering, the teams.
export function ClassBar({ state, clockOffset, myId, color }: { state: ClassLiveState | null; clockOffset: number; myId: number; color: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(tick)
  }, [])
  // Who answers shows for 10 s from each pick (the console sends the same pick again every few seconds).
  const pickKey = state?.picked ? `${state.picked}:${state.roll?.seq ?? ''}` : null
  const [pickSeen, setPickSeen] = useState<{ key: string; at: number } | null>(null)
  useEffect(() => {
    if (!pickKey || pickKey === pickSeen?.key) return
    const timer = setTimeout(() => setPickSeen({ key: pickKey, at: Date.now() }), 0)
    return () => clearTimeout(timer)
  }, [pickKey, pickSeen?.key])
  if (!state) return null
  const pickedShown = state.picked && pickSeen?.key === pickKey && now - pickSeen.at < pickedSeconds * 1000 ? state.picked : null
  const left =
    state.timer.endsAt != null ? Math.max(0, (state.timer.endsAt + clockOffset - now) / 1000) : (state.timer.pausedLeft ?? null)
  const myTeam = state.teams?.find((team) => team.members.some((member) => member.id === myId)) ?? null
  if (left === null && !pickedShown && !state.teams?.length) return null

  const chip: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 16,
    fontWeight: 800,
    background: '#fff',
    color: '#0f172a',
    whiteSpace: 'nowrap',
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 12px', background: '#1e1b4b', alignItems: 'center', fontFamily: font }}>
      {left !== null && (
        <span style={{ ...chip, color: left === 0 ? '#b91c1c' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
          ⏱ {left === 0 ? "Time's up!" : formatClock(Math.ceil(left))}
        </span>
      )}
      {pickedShown && <span style={{ ...chip, background: color, color: '#fff' }}>🙋 {pickedShown}&apos;s turn</span>}
      {state.teams && state.teams.length > 0 && (
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
          {state.teams.map((team) => (
            <span
              key={team.key}
              style={{
                ...chip,
                background: team.color,
                color: team.text,
                outline: myTeam?.key === team.key ? '3px solid #fcd34d' : undefined,
              }}
            >
              {myTeam?.key === team.key ? '👉 ' : ''}
              {team.label} ⭐ {team.score}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
