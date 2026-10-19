import { useCallback, useEffect, useMemo, useState } from 'react'
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import {
  DEFAULT_LEAVE_REASONS,
  DEFAULT_TIME_ZONE,
  WEEKDAYS,
  WEEK_ORDER,
  deleteRosterChange,
  describeWeek,
  fetchHoursSettings,
  fetchRosterChanges,
  fetchShifts,
  rosterDraftError,
  saveBusinessHours,
  saveLeaveReasons,
  saveRosterDraft,
  saveStaffWeek,
  weekError,
  weekOn,
  zonedIso,
  type BusinessHours,
  type RosterChange,
  type RosterDraft,
  type Shift,
  type WeekTime,
} from '../../lib/staffHours'

type Person = { id: number; name: string }

type WorkingHoursPanelProps = {
  people: Person[]
  // An admin changes weeks and time off; Class Settings changes the opening hours and the kinds of time off.
  canEdit: boolean
  canEditSettings: boolean
  todayString: string
}

const inputClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-100'

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatWhen(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

// One week, as a list of times per weekday (Monday first). Used for a person's week and the opening hours.
function WeekEditor({ value, onChange }: { value: WeekTime[]; onChange: (next: WeekTime[]) => void }) {
  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
      {WEEK_ORDER.map((weekday) => {
        const times = value.map((time, index) => ({ time, index })).filter(({ time }) => time.weekday === weekday)
        return (
          <div key={weekday} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-start">
            <div className="w-28 shrink-0 pt-2 text-sm font-semibold text-slate-700">{WEEKDAYS[weekday]}</div>
            <div className="flex flex-1 flex-col gap-2">
              {times.length === 0 && <div className="pt-2 text-sm text-slate-400">Not working</div>}
              {times.map(({ time, index }) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[weekday]} from`}
                    value={time.start}
                    onChange={(event) => onChange(value.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))}
                    className={inputClass}
                  />
                  <span className="text-sm text-slate-400">to</span>
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[weekday]} until`}
                    value={time.end === '24:00' ? '23:59' : time.end}
                    onChange={(event) => onChange(value.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)))}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${WEEKDAYS[weekday]} time`}
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-red-600"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onChange([...value, { weekday, start: '09:00', end: '18:00' }])}
              className="inline-flex items-center gap-1 self-start pt-2 text-xs font-semibold text-[#be185d]"
            >
              <Plus size={12} weight="bold" /> Add time
            </button>
          </div>
        )
      })}
    </div>
  )
}

const hoursToWeek = (hours: BusinessHours): WeekTime[] =>
  Object.entries(hours.days).flatMap(([day, times]) => times.map((time) => ({ weekday: Number(day), start: time.start, end: time.end })))

const weekToHours = (week: WeekTime[], timeZone: string): BusinessHours => {
  const days: BusinessHours['days'] = {}
  for (const time of week) {
    days[String(time.weekday)] = [...(days[String(time.weekday)] ?? []), { start: time.start, end: time.end }]
  }
  return { days, timeZone }
}

// My Team > Working hours: each person's week, time off / extra time / swaps, the school's opening hours.
export function WorkingHoursPanel({ people, canEdit, canEditSettings, todayString }: WorkingHoursPanelProps) {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [changes, setChanges] = useState<RosterChange[]>([])
  const [businessHours, setBusinessHours] = useState<BusinessHours>({ days: {}, timeZone: DEFAULT_TIME_ZONE })
  const [leaveReasons, setLeaveReasons] = useState<string[]>(DEFAULT_LEAVE_REASONS)
  const [error, setError] = useState<string | null>(null)
  const [weekFor, setWeekFor] = useState<{ person: Person; week: WeekTime[]; from: string; first: boolean } | null>(null)
  const [roster, setRoster] = useState<RosterDraft | null>(null)
  const [hoursDraft, setHoursDraft] = useState<WeekTime[] | null>(null)
  const [reasonsDraft, setReasonsDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const timeZone = businessHours.timeZone

  const load = useCallback(async () => {
    try {
      const [nextShifts, nextChanges, settings] = await Promise.all([
        fetchShifts(),
        fetchRosterChanges(zonedIso(addDays(todayString, -30), '00:00'), zonedIso(addDays(todayString, 120), '00:00')),
        fetchHoursSettings(),
      ])
      setShifts(nextShifts)
      setChanges(nextChanges)
      setBusinessHours(settings.businessHours)
      setLeaveReasons(settings.leaveReasons)
      setError(null)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      setError(/staff_shifts|staff_roster_changes|does not exist|could not find/i.test(message)
        ? 'Working hours are not set up in the database yet. Ask the admin to update the database.'
        : message || "Couldn't load the working hours.")
    }
  }, [todayString])

  useEffect(() => {
    void load()
  }, [load])

  const nameOf = useMemo(() => new Map(people.map((person) => [person.id, person.name])), [people])

  async function run(task: () => Promise<void>, close: () => void) {
    setSaving(true)
    setFormError(null)
    try {
      await task()
      close()
      await load()
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Couldn't save.")
    } finally {
      setSaving(false)
    }
  }

  function openWeek(person: Person) {
    setFormError(null)
    setWeekFor({
      person,
      week: weekOn(shifts, person.id, todayString),
      from: todayString,
      first: !shifts.some((shift) => shift.teacherId === person.id),
    })
  }

  function openRoster(kind: RosterDraft['kind']) {
    setFormError(null)
    setRoster({
      kind,
      teacherId: people[0]?.id ?? null,
      otherTeacherId: people[1]?.id ?? null,
      fromDay: todayString,
      fromTime: '09:00',
      toDay: todayString,
      toTime: '18:00',
      reason: kind === 'off' ? leaveReasons[0] ?? '' : kind === 'swap' ? leaveReasons.find((reason) => /swap/i.test(reason)) ?? '' : '',
      note: '',
    })
  }

  const upcoming = changes.filter((change) => change.endsAt >= zonedIso(todayString, '00:00', timeZone))
  const swaps = new Map<string, RosterChange[]>()
  for (const change of upcoming) {
    if (change.swapId) swaps.set(change.swapId, [...(swaps.get(change.swapId) ?? []), change])
  }
  const shownChanges = upcoming.filter((change) => !change.swapId || change.change === 'off')

  return (
    <div className="space-y-4">
      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-slate-900">Working hours</h2>
          <p className="mt-1 text-sm text-slate-500">
            Team Replies counts a wait only while the person who answered was working. Someone with no hours set counts the opening hours below
            {Object.keys(businessHours.days).length === 0 ? ' (none set: the whole day)' : ''}.
          </p>
        </div>
        <ul className="divide-y divide-slate-200">
          {people.map((person) => (
            <li key={person.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{person.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">{describeWeek(weekOn(shifts, person.id, todayString))}</div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => openWeek(person)}
                  className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:self-auto"
                >
                  <PencilSimple size={14} /> Edit hours
                </button>
              )}
            </li>
          ))}
          {people.length === 0 && <li className="px-6 py-4 text-sm text-slate-500">No teacher or staff accounts yet.</li>}
        </ul>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Time off and swaps</h2>
            <p className="mt-1 text-sm text-slate-500">Today and later. Time off is not counted as working time.</p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openRoster('off')} className="rounded-xl bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]">
                + Time off
              </button>
              <button type="button" onClick={() => openRoster('swap')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                + Swap
              </button>
              <button type="button" onClick={() => openRoster('extra')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                + Extra time
              </button>
            </div>
          )}
        </div>
        <ul className="divide-y divide-slate-200">
          {shownChanges.length === 0 && <li className="px-6 py-4 text-sm text-slate-500">Nothing planned.</li>}
          {shownChanges.map((change) => {
            const partner = change.swapId ? swaps.get(change.swapId)?.find((other) => other.id !== change.id) : null
            return (
              <li key={change.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0 text-sm">
                  <div className="font-semibold text-slate-800">
                    {nameOf.get(change.teacherId) ?? `#${change.teacherId}`}
                    {partner
                      ? ` → ${nameOf.get(partner.teacherId) ?? `#${partner.teacherId}`} works instead`
                      : change.change === 'extra'
                        ? ' · extra time'
                        : ` · ${change.reason ?? 'time off'}`}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatWhen(change.startsAt, timeZone)} – {formatWhen(change.endsAt, timeZone)}
                    {change.note ? ` · ${change.note}` : ''}
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => {
                      if (window.confirm(partner ? 'Remove this swap (both people)?' : 'Remove this?')) {
                        void run(() => deleteRosterChange(change.id), () => undefined)
                      }
                    }}
                    className="self-start rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-red-600 sm:self-auto"
                  >
                    <Trash size={16} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Opening hours and kinds of time off</h2>
            <p className="mt-1 text-sm text-slate-500">
              {Object.keys(businessHours.days).length === 0 ? 'Opening hours: not set (the whole day counts).' : `Opening hours: ${describeWeek(hoursToWeek(businessHours))}.`}{' '}
              Kinds of time off: {leaveReasons.join(', ')}.
            </p>
          </div>
          {canEditSettings && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setFormError(null); setHoursDraft(hoursToWeek(businessHours)) }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Edit opening hours
              </button>
              <button type="button" onClick={() => { setFormError(null); setReasonsDraft(leaveReasons.join('\n')) }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Edit kinds of time off
              </button>
            </div>
          )}
        </div>
      </section>

      {weekFor && (
        <ModalShell onClose={() => setWeekFor(null)}>
          <div className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Working hours of {weekFor.person.name}</h2>
            <WeekEditor value={weekFor.week} onChange={(week) => setWeekFor({ ...weekFor, week })} />
            {weekFor.first ? (
              <p className="text-xs text-slate-500">The first hours you set count for the past too, so the old days of Team Replies can be worked out with them.</p>
            ) : (
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">From</span>
                <input type="date" value={weekFor.from} onChange={(event) => setWeekFor({ ...weekFor, from: event.target.value })} className={inputClass} />
                <span className="block text-xs text-slate-500">Days before keep the hours they had.</span>
              </label>
            )}
            {formError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setWeekFor(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const problem = weekError(weekFor.week)
                  if (problem) return setFormError(problem)
                  void run(() => saveStaffWeek(weekFor.person.id, weekFor.week, weekFor.first ? null : weekFor.from), () => setWeekFor(null))
                }}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save hours'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {roster && (
        <ModalShell onClose={() => setRoster(null)} maxWidth="sm">
          <div className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900">
              {roster.kind === 'off' ? 'Time off' : roster.kind === 'swap' ? 'Swap' : 'Extra time'}
            </h2>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">{roster.kind === 'swap' ? 'Who is off' : 'Who'}</span>
              <select value={roster.teacherId ?? ''} onChange={(event) => setRoster({ ...roster, teacherId: Number(event.target.value) })} className={`${inputClass} w-full`}>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </label>
            {roster.kind === 'swap' && (
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Who works instead</span>
                <select value={roster.otherTeacherId ?? ''} onChange={(event) => setRoster({ ...roster, otherTeacherId: Number(event.target.value) })} className={`${inputClass} w-full`}>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">From</span>
                <input type="date" value={roster.fromDay} onChange={(event) => setRoster({ ...roster, fromDay: event.target.value, toDay: roster.toDay < event.target.value ? event.target.value : roster.toDay })} className={`${inputClass} w-full`} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">at</span>
                <input type="time" value={roster.fromTime} onChange={(event) => setRoster({ ...roster, fromTime: event.target.value })} className={`${inputClass} w-full`} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Until</span>
                <input type="date" value={roster.toDay} onChange={(event) => setRoster({ ...roster, toDay: event.target.value })} className={`${inputClass} w-full`} />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">at</span>
                <input type="time" value={roster.toTime} onChange={(event) => setRoster({ ...roster, toTime: event.target.value })} className={`${inputClass} w-full`} />
              </label>
            </div>
            <button
              type="button"
              onClick={() =>
                setRoster({ ...roster, fromTime: '00:00', toTime: '00:00', toDay: addDays(roster.toDay < roster.fromDay ? roster.fromDay : roster.toDay, 1) })
              }
              className="text-xs font-semibold text-[#be185d]"
            >
              Whole days
            </button>
            {roster.kind !== 'extra' && (
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Kind</span>
                <select value={roster.reason} onChange={(event) => setRoster({ ...roster, reason: event.target.value })} className={`${inputClass} w-full`}>
                  <option value="">—</option>
                  {leaveReasons.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-slate-700">Note (optional)</span>
              <input value={roster.note} maxLength={300} onChange={(event) => setRoster({ ...roster, note: event.target.value })} className={`${inputClass} w-full`} />
            </label>
            {formError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRoster(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const problem = rosterDraftError(roster)
                  if (problem) return setFormError(problem)
                  void run(() => saveRosterDraft(roster, timeZone), () => setRoster(null))
                }}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {hoursDraft && (
        <ModalShell onClose={() => setHoursDraft(null)}>
          <div className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Opening hours</h2>
            <p className="text-sm text-slate-500">For whoever has no hours set, and for messages typed on the phone. Leave every day empty to count the whole day.</p>
            <WeekEditor value={hoursDraft} onChange={setHoursDraft} />
            {formError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setHoursDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const problem = weekError(hoursDraft)
                  if (problem) return setFormError(problem)
                  void run(() => saveBusinessHours(weekToHours(hoursDraft, timeZone)), () => setHoursDraft(null))
                }}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save opening hours'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {reasonsDraft !== null && (
        <ModalShell onClose={() => setReasonsDraft(null)} maxWidth="sm">
          <div className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Kinds of time off</h2>
            <p className="text-sm text-slate-500">One per line.</p>
            <textarea rows={6} value={reasonsDraft} onChange={(event) => setReasonsDraft(event.target.value)} className={`${inputClass} w-full`} />
            {formError && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReasonsDraft(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  const reasons = reasonsDraft.split('\n').map((reason) => reason.trim()).filter(Boolean)
                  if (reasons.length === 0) return setFormError('Write at least one kind.')
                  if (reasons.some((reason) => reason.length > 60)) return setFormError('Each kind can have up to 60 letters.')
                  void run(() => saveLeaveReasons(reasons), () => setReasonsDraft(null))
                }}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
