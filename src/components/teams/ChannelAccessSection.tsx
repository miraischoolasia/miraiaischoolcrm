import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import {
  channelDraftError,
  channelKindLabels,
  fetchChannelGrants,
  fetchInboxChannels,
  saveInboxChannel,
  type ChannelGrant,
  type ChannelKind,
  type InboxChannel,
} from '../../lib/inboxChannels'
import type { Team } from '../../lib/staffTeams'

export type InboxOption = { id: number; name: string; kind: ChannelKind }

type ChannelAccessSectionProps = {
  teams: Team[]
  people: { id: number; name: string }[]
  nameOf: Map<number, string>
  listInboxes?: () => Promise<InboxOption[]>
}

type Editing = { channel: InboxChannel; grants: ChannelGrant[]; isNew: boolean }

const inputClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]'

// Which inbox channel each team or person may see and answer (docs/teams-permissions-design.md, section 5).
export function ChannelAccessSection({ teams, people, nameOf, listInboxes }: ChannelAccessSectionProps) {
  const [channels, setChannels] = useState<InboxChannel[]>([])
  const [grants, setGrants] = useState<Map<number, ChannelGrant[]>>(new Map())
  const [inboxes, setInboxes] = useState<InboxOption[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [nextChannels, nextGrants] = await Promise.all([fetchInboxChannels(), fetchChannelGrants()])
      setChannels(nextChannels)
      setGrants(nextGrants)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load the channels.")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!listInboxes) return
    listInboxes()
      .then(setInboxes)
      .catch(() => setInboxes([]))
  }, [listInboxes])

  const unlisted = inboxes.filter((inbox) => !channels.some((channel) => channel.inboxId === inbox.id))
  const teamName = (id: number) => teams.find((team) => team.id === id)?.name ?? `Team ${id}`
  const grantText = (grant: ChannelGrant) =>
    `${'teamId' in grant ? teamName(grant.teamId) : nameOf.get(grant.teacherId) ?? `#${grant.teacherId}`} (${grant.level === 'reply' ? 'reply' : 'view'})`

  function startNew(inbox?: InboxOption) {
    setError(null)
    setEditing({
      isNew: true,
      channel: { inboxId: inbox?.id ?? 0, kind: inbox?.kind ?? 'whatsapp', label: inbox?.name.slice(0, 60) ?? '', access: 'limited', isActive: true },
      grants: [],
    })
  }

  async function handleSave() {
    if (!editing) return
    const problem = channelDraftError(editing.channel, editing.grants)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveInboxChannel(editing.channel, editing.channel.access === 'open' ? [] : editing.grants)
      setEditing(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the channel.")
    } finally {
      setSaving(false)
    }
  }

  const setGrant = (index: number, next: ChannelGrant) =>
    editing && setEditing({ ...editing, grants: editing.grants.map((grant, i) => (i === index ? next : grant)) })

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Inbox channels</h2>
          <p className="mt-1 text-sm text-slate-500">
            Open: everyone with the Inbox tick. Limited: only the teams and people listed. Nobody answers more than their Inbox tick allows.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startNew(unlisted[0])}
          className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Plus size={16} weight="bold" /> Add channel
        </button>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {error && !editing && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {channels.length === 0 && !editing && (
          <p className="text-sm text-slate-500">No channel is set up, so every channel is open to everyone with the Inbox tick.</p>
        )}
        <ul className="divide-y divide-slate-200">
          {channels.map((channel) => (
            <li key={channel.inboxId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">
                  {channel.label} <span className="font-normal text-slate-400">· {channelKindLabels[channel.kind]} · inbox {channel.inboxId}</span>
                  {!channel.isActive && <span className="ml-2 text-xs text-slate-400">(off)</span>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {channel.access === 'open'
                    ? 'Open to everyone with the Inbox tick'
                    : (grants.get(channel.inboxId) ?? []).map(grantText).join(' · ') || 'Limited: only admins'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setEditing({ isNew: false, channel, grants: grants.get(channel.inboxId) ?? [] })
                }}
                className="self-start rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:self-auto"
              >
                Edit
              </button>
            </li>
          ))}
        </ul>

        {editing && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Inbox</span>
                {editing.isNew && unlisted.length > 0 ? (
                  <select
                    value={editing.channel.inboxId}
                    onChange={(event) => {
                      const inbox = unlisted.find((option) => option.id === Number(event.target.value))
                      setEditing({
                        ...editing,
                        channel: { ...editing.channel, inboxId: Number(event.target.value), kind: inbox?.kind ?? editing.channel.kind, label: inbox?.name.slice(0, 60) ?? editing.channel.label },
                      })
                    }}
                    className={`${inputClass} w-full`}
                  >
                    {unlisted.map((inbox) => (
                      <option key={inbox.id} value={inbox.id}>
                        {inbox.name} ({channelKindLabels[inbox.kind]}, {inbox.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={editing.channel.inboxId || ''}
                    disabled={!editing.isNew}
                    onChange={(event) => setEditing({ ...editing, channel: { ...editing.channel, inboxId: Number(event.target.value) } })}
                    className={`${inputClass} w-full disabled:bg-slate-100`}
                  />
                )}
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Name</span>
                <input
                  value={editing.channel.label}
                  maxLength={60}
                  onChange={(event) => setEditing({ ...editing, channel: { ...editing.channel, label: event.target.value } })}
                  className={`${inputClass} w-full`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Kind</span>
                <select
                  value={editing.channel.kind}
                  onChange={(event) => setEditing({ ...editing, channel: { ...editing.channel, kind: event.target.value as ChannelKind } })}
                  className={`${inputClass} w-full`}
                >
                  {(Object.keys(channelKindLabels) as ChannelKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {channelKindLabels[kind]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-slate-700" role="radiogroup" aria-label="Who may use it">
              {(['open', 'limited'] as const).map((access) => (
                <label key={access} className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="channel-access"
                    checked={editing.channel.access === access}
                    onChange={() => setEditing({ ...editing, channel: { ...editing.channel, access } })}
                    className="accent-[#fc0c97]"
                  />
                  {access === 'open' ? 'Open to everyone with the Inbox tick' : 'Only these teams and people'}
                </label>
              ))}
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.channel.isActive}
                  onChange={(event) => setEditing({ ...editing, channel: { ...editing.channel, isActive: event.target.checked } })}
                  className="h-4 w-4 accent-[#fc0c97]"
                />
                Channel is on
              </label>
            </div>

            {editing.channel.access === 'limited' && (
              <div className="space-y-2">
                {editing.grants.map((grant, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Team or person"
                      value={'teamId' in grant ? `team:${grant.teamId}` : `person:${grant.teacherId}`}
                      onChange={(event) => {
                        const [kind, id] = event.target.value.split(':')
                        setGrant(index, kind === 'team' ? { teamId: Number(id), level: grant.level } : { teacherId: Number(id), level: grant.level })
                      }}
                      className={inputClass}
                    >
                      <optgroup label="Teams">
                        {teams.map((team) => (
                          <option key={team.id} value={`team:${team.id}`}>
                            {team.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="People">
                        {people.map((person) => (
                          <option key={person.id} value={`person:${person.id}`}>
                            {person.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      aria-label="May"
                      value={grant.level}
                      onChange={(event) => setGrant(index, { ...grant, level: event.target.value as ChannelGrant['level'] })}
                      className={inputClass}
                    >
                      <option value="view">Only look</option>
                      <option value="reply">Look and reply</option>
                    </select>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => setEditing({ ...editing, grants: editing.grants.filter((_, i) => i !== index) })}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-red-600"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={teams.length === 0 && people.length === 0}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      grants: [...editing.grants, teams[0] ? { teamId: teams[0].id, level: 'reply' } : { teacherId: people[0].id, level: 'reply' }],
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#be185d] disabled:text-slate-300"
                >
                  <Plus size={14} weight="bold" /> Add a team or person
                </button>
              </div>
            )}

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save channel'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
