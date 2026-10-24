import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { useRoleNames } from '../../lib/roleNames'
import {
  fetchTodayRoles,
  pickView,
  readRememberedView,
  rememberView,
  todayViews,
  type TodayRoles,
  type TodayView,
} from '../../lib/today'
import { useTodayData } from '../../hooks/useTodayData'
import { EcToday } from './EcToday'
import { LcToday } from './LcToday'
import { TeacherToday } from './TeacherToday'
import { TeamToday } from './TeamToday'

export type TodayPerson = { id: number; name: string }

type TodayByRoleProps = {
  isAdmin: boolean
  isTeacherAccount: boolean
  // The staff an admin can look at; left out (or empty) when there is nobody to pick.
  people?: TodayPerson[]
  // The Today the page already had: the general one (what the account's ticks allow) and the teacher's own.
  adminNode: ReactNode
  teacherNode: ReactNode
  // The follow-up work list for a person (null = the signed-in one).
  renderFollowUps: (personId: number | null) => ReactNode
  onOpenLead: (leadId: number) => void
  onOpenLeads: () => void
  onOpenStudent: (studentId: number) => void
}

// Today by role. Whoever has one job sees that Today straight away; whoever has two sees small tabs (the one they
// used last comes first); an admin can also look at somebody else's Today. The role versions only show what belongs to
// that person: the database picks the rows, not this page.
export function TodayByRole({
  isAdmin,
  isTeacherAccount,
  people = [],
  adminNode,
  teacherNode,
  renderFollowUps,
  onOpenLead,
  onOpenLeads,
  onOpenStudent,
}: TodayByRoleProps) {
  const names = useRoleNames()
  const [lookAt, setLookAt] = useState<number | null>(null)
  const { data: roleData } = useTodayData(fetchTodayRoles, lookAt)
  const roles: TodayRoles | null = roleData

  const views = useMemo<TodayView[]>(() => {
    if (lookAt !== null) {
      const theirs: TodayView[] = []
      if (roles?.ec) theirs.push('ec')
      if (roles?.lc) theirs.push('lc')
      return theirs
    }
    return todayViews({ isAdmin, isTeacherAccount, roles })
  }, [lookAt, isAdmin, isTeacherAccount, roles])

  const [chosen, setChosen] = useState<TodayView | null>(() => readRememberedView() as TodayView | null)
  const view = pickView(views, chosen)

  useEffect(() => {
    if (view !== null && lookAt === null) {
      rememberView(view)
    }
  }, [view, lookAt])

  const label = (key: TodayView) =>
    key === 'ec' ? names.ec : key === 'lc' ? names.lc : key === 'teacher' ? 'Teacher' : isAdmin ? 'Admin' : 'Overview'

  const showTabs = views.length > 1
  const showPicker = isAdmin && people.length > 0

  const body = (() => {
    if (view === 'admin') {
      return (
        <>
          {isAdmin && (
            <TeamToday onOpenLead={onOpenLead} onOpenPerson={(id) => setLookAt(id)} />
          )}
          {adminNode}
        </>
      )
    }
    if (view === 'teacher') {
      return (
        <TeacherToday personId={null} onOpenStudent={onOpenStudent}>
          {teacherNode}
        </TeacherToday>
      )
    }
    if (view === 'ec') {
      return (
        <EcToday
          key={`ec-${lookAt ?? 'me'}`}
          personId={lookAt}
          roleName={names.ec}
          followUps={renderFollowUps(lookAt)}
          onOpenLead={onOpenLead}
          onOpenLeads={onOpenLeads}
        />
      )
    }
    if (view === 'lc') {
      return <LcToday key={`lc-${lookAt ?? 'me'}`} personId={lookAt} roleName={names.lc} onOpenStudent={onOpenStudent} />
    }
    return null
  })()

  // One version and nobody to look at: the page as it always was, with nothing around it.
  if (!showTabs && !showPicker && lookAt === null) {
    return <>{body}</>
  }

  const lookedAt = people.find((person) => person.id === lookAt)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showTabs ? (
          <div role="tablist" aria-label="Today for" className="flex flex-wrap gap-2">
            {views.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setChosen(key)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-semibold',
                  view === key ? 'bg-[#fc0c97] text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {label(key)}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        {showPicker && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Look at Today of
            <select
              value={lookAt ?? ''}
              onChange={(event) => {
                setLookAt(event.target.value === '' ? null : Number(event.target.value))
                setChosen(null)
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Me</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {lookAt !== null && views.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          {lookedAt?.name ?? 'This person'} has no {names.ec} or {names.lc} work to show. Choose "Me" to go back.
        </p>
      )}

      {body}
    </div>
  )
}
