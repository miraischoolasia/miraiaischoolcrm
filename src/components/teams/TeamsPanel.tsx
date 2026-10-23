import { useEffect, useMemo, useState } from 'react'
import { Plus, UsersThree } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { describePermissions } from '../../lib/permissions'
import {
  SUGGESTED_TEAMS,
  TEAM_COLORS,
  TEAM_SETUP_MISSING,
  membersOf,
  saveTeam,
  setTeamMembers,
  teamDraftError,
  type Team,
  type TeamDraft,
  type TeamMembers,
} from '../../lib/staffTeams'
import { PermissionMatrix } from '../PermissionMatrix'
import { ChannelAccessSection, type InboxOption } from './ChannelAccessSection'
import { PicLinksSection } from './PicLinksSection'
import { TagPicLinksSection } from './TagPicLinksSection'

export type TeamPerson = { id: number; name: string; role: 'admin' | 'teacher' | 'staff' }

type TeamsPanelProps = {
  teams: Team[]
  members: TeamMembers
  missing: boolean
  loadError: string | null
  people: TeamPerson[]
  // Who a PIC name can stand for: the people above and the admins (they have a PIC name too). Defaults to people.
  picPeople?: TeamPerson[]
  onChanged: () => Promise<void> | void
  // The Chatwoot inboxes (names and kinds), when the Inbox is connected.
  listInboxes?: () => Promise<InboxOption[]>
}

const emptyDraft = (): TeamDraft => ({ id: null, name: '', color: TEAM_COLORS[0], description: '', permissions: {}, isActive: true })

function draftOf(team: Team): TeamDraft {
  return {
    id: team.id,
    name: team.name,
    color: team.color,
    description: team.description ?? '',
    permissions: team.permissions,
    isActive: team.isActive,
  }
}

// My Team > Teams: make teams, put people in them, tick what each team may use and which inbox channels.
export function TeamsPanel({ teams, members, missing, loadError, people, picPeople, onChanged, listInboxes }: TeamsPanelProps) {
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<TeamDraft>(emptyDraft)
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const selected = typeof selectedId === 'number' ? teams.find((team) => team.id === selectedId) ?? null : null
  // Admins can use everything anyway, so a team only matters to the other accounts.
  const pickable = useMemo(() => people.filter((person) => person.role !== 'admin'), [people])
  const nameOf = useMemo(() => new Map(people.map((person) => [person.id, person.name])), [people])

  useEffect(() => {
    if (selectedId === null && teams.length > 0) {
      setSelectedId(teams[0].id)
    }
  }, [selectedId, teams])

  useEffect(() => {
    setError(null)
    setSaved(false)
    if (selectedId === 'new') {
      setDraft(emptyDraft())
      setMemberIds([])
    } else if (selected) {
      setDraft(draftOf(selected))
      setMemberIds(membersOf(selected.id, members))
    }
    // Only when another team is picked (not while typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.id])

  async function handleSave() {
    const problem = teamDraftError(draft, teams)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const id = await saveTeam(draft)
      await setTeamMembers(id, memberIds)
      await onChanged()
      setSelectedId(id)
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the team.")
    } finally {
      setSaving(false)
    }
  }

  async function handleSuggested() {
    setSaving(true)
    setError(null)
    try {
      for (const suggestion of SUGGESTED_TEAMS) {
        await saveTeam({ ...suggestion, id: null })
      }
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't make the teams.")
    } finally {
      setSaving(false)
    }
  }

  if (missing) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{TEAM_SETUP_MISSING}</div>
  }

  return (
    <div className="space-y-4">
      {loadError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Teams</h2>
            <p className="mt-1 text-sm text-slate-500">
              Everyone in a team gets its ticks. Someone in several teams gets the widest of them, plus their own ticks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedId('new')}
            className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#fc0c97] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
          >
            <Plus size={16} weight="bold" /> New team
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Teams" className="border-b border-slate-200 p-3 lg:border-b-0 lg:border-r">
            {teams.length === 0 && selectedId !== 'new' ? (
              <div className="space-y-3 p-2 text-sm text-slate-500">
                <p>No teams yet.</p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSuggested()}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Start with suggested teams
                </button>
                <p className="text-xs">Makes Sales, Teachers and Office with usual ticks and nobody in them. Change them as you like.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {teams.map((team) => (
                  <li key={team.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(team.id)}
                      aria-current={selectedId === team.id ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
                        selectedId === team.id ? 'bg-[#fff1f8] font-semibold text-[#be185d]' : 'text-slate-700 hover:bg-slate-50',
                      )}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color ?? '#94a3b8' }} />
                      <span className={cn('min-w-0 flex-1 truncate', !team.isActive && 'text-slate-400 line-through')}>{team.name}</span>
                      <span className="text-xs text-slate-400">{membersOf(team.id, members).length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          <div className="space-y-5 p-5 sm:p-6">
            {selectedId === null ? (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <UsersThree size={20} /> Pick a team, or make a new one.
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-slate-700">Name</span>
                    <input
                      value={draft.name}
                      maxLength={60}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                    />
                  </label>
                  <div className="space-y-1.5">
                    <span className="text-sm font-semibold text-slate-700">Colour</span>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team colour">
                      {TEAM_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={draft.color === color}
                          aria-label={color}
                          onClick={() => setDraft({ ...draft, color })}
                          className={cn('h-8 w-8 rounded-full border-2', draft.color === color ? 'border-slate-900' : 'border-white shadow')}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-slate-700">What the team does (optional)</span>
                  <input
                    value={draft.description}
                    maxLength={300}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
                    className="h-4 w-4 accent-[#fc0c97]"
                  />
                  Team is on (switched off, it gives nobody anything)
                </label>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold text-slate-700">People in this team</legend>
                  {pickable.length === 0 ? (
                    <p className="text-sm text-slate-500">No teacher or staff accounts yet.</p>
                  ) : (
                    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {pickable.map((person) => (
                        <label key={person.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={memberIds.includes(person.id)}
                            onChange={(event) =>
                              setMemberIds(
                                event.target.checked ? [...memberIds, person.id] : memberIds.filter((id) => id !== person.id),
                              )
                            }
                            className="h-4 w-4 accent-[#fc0c97]"
                          />
                          <span className="truncate">{person.name}</span>
                          <span className="text-xs text-slate-400">{person.role === 'teacher' ? 'Teacher' : 'Staff'}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>

                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">What the team may use</div>
                  <PermissionMatrix value={draft.permissions} onChange={(permissions) => setDraft({ ...draft, permissions })} />
                  <p className="text-xs text-slate-500">
                    In short: {describePermissions(draft.permissions)}. Teachers always see their own classes, with or without a team.
                  </p>
                </div>

                {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {saved && !error && <div className="text-sm font-semibold text-emerald-700">Saved. Everyone in the team has these ticks now.</div>}

                <div className="flex flex-wrap justify-end gap-2">
                  {selectedId === 'new' && (
                    <button
                      type="button"
                      onClick={() => setSelectedId(teams[0]?.id ?? null)}
                      className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave()}
                    className="rounded-xl bg-[#fc0c97] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : selectedId === 'new' ? 'Make team' : 'Save team'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <ChannelAccessSection teams={teams} people={pickable} nameOf={nameOf} listInboxes={listInboxes} />
      <PicLinksSection people={picPeople ?? people} />
      <TagPicLinksSection />
    </div>
  )
}
