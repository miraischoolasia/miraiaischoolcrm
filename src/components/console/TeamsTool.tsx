import { useState } from 'react'
import { UsersFour } from '@phosphor-icons/react'
import { StudentAvatar } from '../StudentAvatar'
import { colorOf, splitTeams, type Team } from '../../lib/teams'
import type { RewardPreset } from '../../lib/rewards'

// Teams in one tap: pick how many, the children (those in Zoom, or everyone)
// are dealt out evenly; give a team points with the school's rewards, and
// show the teams on the class screen.
export function TeamsTool({
  candidates,
  names,
  teams,
  presets,
  onTeams,
  onGiveTeam,
  onScreen,
  onScreenChange,
}: {
  candidates: number[]
  names: Map<number, string>
  teams: Team[] | null
  presets: RewardPreset[]
  onTeams: (teams: Team[] | null) => void
  onGiveTeam: (team: Team, preset: RewardPreset) => Promise<string | null>
  onScreen: boolean
  onScreenChange: (show: boolean) => void
}) {
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const shownPresets = presets.filter((preset) => preset.isActive).slice(0, 4)

  async function give(team: Team, preset: RewardPreset) {
    setBusy(true)
    const problem = await onGiveTeam(team, preset)
    setBusy(false)
    setMessage(problem ?? `${team.label}: +${preset.points} each`)
  }

  return (
    <section aria-label="Teams" className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <UsersFour size={16} className="text-violet-600" aria-hidden="true" />
          Teams
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Teams
            <select value={count} onChange={(event) => setCount(Number(event.target.value))} className="rounded-lg border border-slate-200 px-1.5 py-0.5 text-xs">
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={candidates.length < 2}
            onClick={() => {
              setMessage(null)
              onTeams(splitTeams(candidates, count))
            }}
            className="rounded-xl bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {teams ? 'Shuffle again' : 'Make teams'}
          </button>
          {teams && (
            <>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={onScreen} onChange={(event) => onScreenChange(event.target.checked)} />
                On class screen
              </label>
              <button type="button" onClick={() => onTeams(null)} className="text-xs font-semibold text-slate-500 underline underline-offset-2">
                Clear
              </button>
            </>
          )}
        </div>
      </div>
      {!teams ? (
        <p className="mt-1 text-xs text-slate-500">
          {candidates.length < 2 ? 'At least 2 children are needed.' : `${candidates.length} children will be split evenly.`}
        </p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {teams.map((team) => {
            const color = colorOf(team.key)
            return (
              <div key={team.key} className="rounded-xl p-2" style={{ background: color.card, color: color.text }}>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{team.label}</span>
                  <span>⭐ {team.score}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {team.memberIds.map((id) => (
                    <span key={id} className="flex items-center gap-1 rounded-full bg-white/90 py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-slate-800">
                      <StudentAvatar id={id} name={names.get(id) ?? ''} size={18} />
                      {(names.get(id) ?? '').trim().split(/\s+/)[0]}
                    </span>
                  ))}
                </div>
                {shownPresets.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {shownPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void give(team, preset)}
                        className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-semibold hover:bg-white/40 disabled:opacity-50"
                      >
                        {preset.emoji ? `${preset.emoji} ` : ''}+{preset.points}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {message && (
        <p className="mt-1 text-xs text-slate-600" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  )
}
