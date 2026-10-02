import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  activityAreaLabels,
  describeActivity,
  getActivityArea,
  getActivityDayLabel,
  type ActivityArea,
} from '../../lib/activity'
import { addDays } from '../../lib/activity'
import type { AdminActivity, Classroom, Teacher } from '../../types/domain'

type AdminActivitySectionProps = {
  activities: AdminActivity[]
  teacherMap: Map<number, Teacher>
  classroomMap?: Map<number, Classroom>
  todayString: string
  // The day shown (YYYY-MM-DD); the parent loads that day's entries.
  day: string
  onChangeDay: (day: string) => void
  isLoading?: boolean
}

const areaTone: Record<ActivityArea, string> = {
  leads: 'bg-amber-50 text-amber-700',
  students: 'bg-sky-50 text-sky-700',
  classes: 'bg-emerald-50 text-emerald-700',
  team: 'bg-violet-50 text-violet-700',
}

const fieldClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#fc0c97]'

export function AdminActivitySection({
  activities,
  teacherMap,
  classroomMap = new Map(),
  todayString,
  day,
  onChangeDay,
  isLoading = false,
}: AdminActivitySectionProps) {
  const [area, setArea] = useState<ActivityArea | 'all'>('all')
  const [actorId, setActorId] = useState<string>('all')
  const [search, setSearch] = useState('')

  const actorName = (id: number | null) =>
    (id !== null && teacherMap.get(id)?.fullName) || 'System'

  const entries = useMemo(
    () =>
      activities.map((activity) => {
        const view = describeActivity(activity, {
          teacher: (id) => teacherMap.get(id)?.fullName,
          classroom: (id) => classroomMap.get(id)?.name,
        })
        const createdAt = new Date(activity.createdAt)
        return {
          activity,
          view,
          area: getActivityArea(activity),
          time: createdAt.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }),
        }
      }),
    [activities, classroomMap, teacherMap],
  )

  const actors = useMemo(() => {
    const ids = [...new Set(activities.map((activity) => activity.actorTeacherId))]
    return ids
      .map((id) => ({ id, name: id !== null && teacherMap.get(id)?.fullName ? teacherMap.get(id)!.fullName : 'System' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activities, teacherMap])

  const term = search.trim().toLowerCase()
  const visible = entries.filter(
    (entry) =>
      (area === 'all' || entry.area === area) &&
      (actorId === 'all' || String(entry.activity.actorTeacherId) === actorId) &&
      (!term ||
        entry.view.title.toLowerCase().includes(term) ||
        entry.activity.entityLabel.toLowerCase().includes(term)),
  )

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Activity Log</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every change made in the CRM, newest first. Entries cannot be edited or deleted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter activity by area">
          {(['all', ...Object.keys(activityAreaLabels)] as (ActivityArea | 'all')[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={area === value}
              onClick={() => setArea(value)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-sm font-semibold',
                area === value
                  ? 'border-[#fc0c97] bg-[#fff0f9] text-[#be185d]'
                  : 'border-slate-200 bg-white text-slate-600',
              )}
            >
              {value === 'all' ? 'All' : activityAreaLabels[value]}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="flex items-center gap-1" role="group" aria-label="Pick a day">
            <button
              type="button"
              onClick={() => onChangeDay(addDays(day, -1))}
              aria-label="Previous day"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            >
              <CaretLeft size={16} aria-hidden="true" />
            </button>
            <input
              type="date"
              value={day}
              max={todayString}
              onChange={(event) => event.target.value && onChangeDay(event.target.value)}
              aria-label="Day"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => onChangeDay(addDays(day, 1))}
              disabled={day >= todayString}
              aria-label="Next day"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <CaretRight size={16} aria-hidden="true" />
            </button>
            {day !== todayString && (
              <button
                type="button"
                onClick={() => onChangeDay(todayString)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Today
              </button>
            )}
          </div>
          <div className="relative sm:w-64">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a name..."
              aria-label="Search activity"
              className={cn(fieldClass, 'w-full !pl-9')}
            />
          </div>
          <select
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
            aria-label="Filter activity by person"
            className={fieldClass}
          >
            <option value="all">Everyone</option>
            {actors.map((actor) => (
              <option key={String(actor.id)} value={String(actor.id)}>
                {actor.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3 className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {getActivityDayLabel(day, todayString)}
        {!isLoading && ` · ${activities.length} ${activities.length === 1 ? 'change' : 'changes'}`}
      </h3>

      {isLoading ? (
        <div className="px-6 py-16 text-center text-sm text-slate-500">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-slate-500">
          {activities.length === 0 ? 'No changes on this day.' : 'Nothing matches these filters.'}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map(({ activity, view, area: entryArea, time }) => (
            <li key={activity.id} className="flex gap-3 px-4 py-3">
              <div className="w-16 shrink-0 pt-0.5 text-xs font-medium text-slate-400">{time}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', areaTone[entryArea])}
                  >
                    {activityAreaLabels[entryArea]}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{view.title}</span>
                </div>
                {view.changes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
                    {view.changes.map((item) => (
                      <li key={item.label}>
                        {item.label}: <span className="text-slate-400">{item.from}</span> →{' '}
                        <span className="font-medium text-slate-800">{item.to}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {view.notes.length > 0 && (
                  <div className="mt-1 text-sm text-slate-500">{view.notes.join(' · ')}</div>
                )}
                <div className="mt-1 text-xs text-slate-400">by {actorName(activity.actorTeacherId)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
