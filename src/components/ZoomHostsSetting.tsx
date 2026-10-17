import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TeacherZoomHosts } from './TeacherZoomHosts'

// Class Settings > Zoom: the school's Zoom accounts that host lessons, and how
// many meetings each may run at once. A lesson's meeting goes to an account
// with room at that time: an idle one first.
export function ZoomHostsSetting() {
  const [saved, setSaved] = useState<{ hosts: string[]; perHost: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [perHost, setPerHost] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'zoom_hosts')
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.value as { hosts?: unknown; per_host?: unknown } | null
        const hosts = Array.isArray(value?.hosts) ? value.hosts.filter((entry): entry is string => typeof entry === 'string') : []
        const each = Number(value?.per_host)
        const count = Number.isInteger(each) && each >= 1 && each <= 10 ? each : 1
        setSaved({ hosts, perHost: count })
        setDraft(hosts.join('\n'))
        setPerHost(count)
      })
  }, [])

  const lines = Array.from(
    new Set(
      draft
        .split(/[\n,]+/)
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean),
    ),
  )
  const dirty = saved !== null && (lines.join('\n') !== saved.hosts.join('\n') || perHost !== saved.perHost)

  async function save() {
    if (!supabase) return
    const { error: saveError } = await supabase.rpc('set_zoom_hosts', { p_hosts: lines, p_per_host: perHost })
    setError(saveError ? saveError.message || 'Failed to save.' : null)
    if (!saveError) {
      setSaved({ hosts: lines, perHost })
      setDraft(lines.join('\n'))
      setDone(true)
    }
  }

  if (saved === null) return null

  return (
    <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
      <h3 className="text-base font-semibold text-slate-900">Zoom accounts for lessons</h3>
      <p className="text-sm text-slate-500">
        The e-mails of the school's Zoom users, one per line, in the order to use them. Each lesson gets an account with room
        at that time: an idle one first, then a second meeting on one that allows it. Another school on the same Zoom account
        must list other users.
      </p>
      <textarea
        value={draft}
        rows={5}
        onChange={(event) => {
          setDone(false)
          setDraft(event.target.value)
        }}
        placeholder={'room1@school.com\nroom2@school.com'}
        aria-label="Zoom accounts for lessons"
        className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
      />
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        Each account can run
        <select
          value={perHost}
          onChange={(event) => {
            setDone(false)
            setPerHost(Number(event.target.value))
          }}
          aria-label="Meetings at once per account"
          className="rounded-xl border border-slate-200 px-2 py-1"
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        {perHost === 1 ? 'meeting at a time.' : 'meetings at the same time (Zoom plans with concurrent meetings).'}
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {done && !dirty && <span className="text-sm font-semibold text-emerald-700">Saved</span>}
        <button
          type="button"
          disabled={!dirty}
          onClick={() => void save()}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <TeacherZoomHosts hosts={saved.hosts} />
    </div>
  )
}
