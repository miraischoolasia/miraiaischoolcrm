import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle, Copy, DeviceMobile, DownloadSimple, MagnifyingGlass, WhatsappLogo, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  createParentLogin,
  createStudentLogin,
  defaultPortalSettings,
  fetchLoginDirectory,
  fetchPortalSettings,
  type PortalAccount,
  type PortalSettings,
} from '../../lib/portal'
import {
  buildLoginRows,
  fillLoginMessage,
  filterLoginRows,
  groupNewLogins,
  isMissing,
  loginCounts,
  newLoginsCsv,
  planLoginJobs,
  type LoginFilter,
  type LoginRow,
  type NewLogin,
} from '../../lib/portalLogins'
import { addNewLogins, clearNewLogins, markOpened, useNewLogins, type SentFamily } from '../../lib/newLoginsStore'
import { useOpenChat } from '../WhatsAppLink'
import type { Student, StudentType } from '../../types/domain'

type Directory = Awaited<ReturnType<typeof fetchLoginDirectory>>

const TYPE_LABELS: Record<StudentType, string> = { trial: 'Trial', regular: 'Regular', preview: 'Preview' }
const SHOW_OPTIONS: Array<[LoginFilter['show'], string]> = [
  ['all', 'All'],
  ['missing', 'Needs a login'],
  ['done', 'All done'],
]

// Students > App Logins: who has a student app login (the child and the
// parent), making many in one go, and sending each family theirs on WhatsApp.
export function AppLoginsSection({
  students,
  canManage,
  onOpenStudent,
}: {
  students: Student[]
  canManage: boolean
  onOpenStudent?: (studentId: number) => void
}) {
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [settings, setSettings] = useState<PortalSettings>(defaultPortalSettings)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LoginFilter>({ search: '', show: 'missing', type: 'all', inactive: false })
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [make, setMake] = useState({ students: true, parents: true })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failures, setFailures] = useState<string[]>([])
  const newLogins = useNewLogins()

  const load = useCallback(() => {
    fetchLoginDirectory()
      .then((next) => {
        setDirectory(next)
        setError(null)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load the logins.'))
  }, [])

  useEffect(() => {
    load()
    fetchPortalSettings()
      .then(setSettings)
      .catch(() => setSettings(defaultPortalSettings))
  }, [load])

  const rows = useMemo(
    () => (directory ? buildLoginRows(students, directory.accounts, directory.parentOfStudent, directory.parents, directory.studentContacts) : []),
    [directory, students],
  )
  const shownRows = useMemo(() => filterLoginRows(rows, filter), [rows, filter])
  const counts = useMemo(() => loginCounts(rows), [rows])
  const pickedRows = useMemo(() => rows.filter((row) => picked.has(row.studentId)), [rows, picked])
  const jobs = useMemo(() => planLoginJobs(pickedRows, make), [pickedRows, make])
  const pickable = shownRows.filter(isMissing)
  const allPicked = pickable.length > 0 && pickable.every((row) => picked.has(row.studentId))

  function toggle(studentId: number) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  function toggleAll() {
    setPicked((current) => {
      const next = new Set(current)
      for (const row of pickable) {
        if (allPicked) next.delete(row.studentId)
        else next.add(row.studentId)
      }
      return next
    })
  }

  async function createAll() {
    if (jobs.length === 0) return
    const made: Array<NewLogin & { family: string }> = []
    const failed: string[] = []
    setFailures([])
    setProgress({ done: 0, total: jobs.length })
    // One at a time: each makes a sign-in account on the server.
    for (const [index, job] of jobs.entries()) {
      const answer = job.kind === 'student' ? await createStudentLogin(job.studentId) : await createParentLogin(job.personId)
      if (answer.ok && answer.username && answer.password) {
        made.push({ kind: job.kind, name: job.name, username: answer.username, password: answer.password, family: job.family })
      } else {
        failed.push(`${job.name} (${job.kind === 'parent' ? 'parent' : 'child'}): ${answer.error ?? 'could not be made'}`)
      }
      setProgress({ done: index + 1, total: jobs.length })
    }
    addNewLogins(groupNewLogins(rows, made))
    setFailures(failed)
    setProgress(null)
    setPicked(new Set())
    load()
  }

  const linkMissing = !settings.app_url.trim()

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <DeviceMobile size={20} className="text-[#fc0c97]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-900">Student app logins</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Every student can have a login for the child and one for the parent. Pick the families, make their logins, then send each
          family theirs on WhatsApp.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Children with a login" value={counts.studentsWithLogin} total={counts.students} />
          <Stat label="Parents with a login" value={counts.parentsWithLogin} total={counts.parents} />
          <Stat
            label="Students with no parent linked"
            value={counts.noParent}
            note="Link the parent from the family card in the Inbox first."
          />
        </div>
        {linkMissing && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The app's web address is not set yet, so the message to families has no link. An admin sets it in Class Settings &gt; Student
            app.
          </p>
        )}
      </section>

      {newLogins.length > 0 && <NewLoginsPanel families={newLogins} settings={settings} />}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {failures.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <div className="font-semibold">Some logins were not made</div>
          <ul className="mt-1 list-disc pl-5">
            {failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
          <label className="relative min-w-[12rem] flex-1">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={filter.search}
              onChange={(event) => setFilter({ ...filter, search: event.target.value })}
              placeholder="Search child, parent, login or phone"
              aria-label="Search"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9! pr-3 text-sm"
            />
          </label>
          <div role="group" aria-label="Show" className="flex rounded-xl border border-slate-200 p-0.5">
            {SHOW_OPTIONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter.show === key}
                onClick={() => setFilter({ ...filter, show: key })}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold',
                  filter.show === key ? 'bg-[#fc0c97] text-white' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={filter.type}
            onChange={(event) => setFilter({ ...filter, type: event.target.value as LoginFilter['type'] })}
            aria-label="Kind of student"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="all">All students</option>
            {(Object.keys(TYPE_LABELS) as StudentType[]).map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filter.inactive}
              onChange={(event) => setFilter({ ...filter, inactive: event.target.checked })}
              className="h-4 w-4 accent-[#fc0c97]"
            />
            Show deactivated
          </label>
        </div>

        {canManage && picked.size > 0 && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-pink-100 bg-pink-50 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-900">{picked.size} picked</span>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={make.students}
                onChange={(event) => setMake({ ...make, students: event.target.checked })}
                className="h-4 w-4 accent-[#fc0c97]"
              />
              Child logins
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={make.parents}
                onChange={(event) => setMake({ ...make, parents: event.target.checked })}
                className="h-4 w-4 accent-[#fc0c97]"
              />
              Parent logins
            </label>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPicked(new Set())}
                disabled={progress !== null}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void createAll()}
                disabled={jobs.length === 0 || progress !== null}
                className="rounded-xl bg-[#fc0c97] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
              >
                {progress
                  ? `Making logins… ${progress.done} of ${progress.total}`
                  : jobs.length === 0
                    ? 'Nothing to make'
                    : `Make ${jobs.length} login${jobs.length === 1 ? '' : 's'}`}
              </button>
            </span>
          </div>
        )}

        {directory === null && !error ? (
          <p className="p-6 text-center text-sm text-slate-500">Loading…</p>
        ) : shownRows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            {filter.show === 'missing' && !filter.search ? 'Every student here has their logins.' : 'No student matches.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  {canManage && (
                    <th className="w-10 px-4 py-2">
                      <input
                        type="checkbox"
                        checked={allPicked}
                        disabled={pickable.length === 0}
                        onChange={toggleAll}
                        aria-label="Pick every student shown who needs a login"
                        className="h-4 w-4 accent-[#fc0c97]"
                      />
                    </th>
                  )}
                  <th className="px-4 py-2 font-semibold">Child</th>
                  <th className="px-4 py-2 font-semibold">Child login</th>
                  <th className="px-4 py-2 font-semibold">Parent</th>
                  <th className="px-4 py-2 font-semibold">Parent login</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((row) => (
                  <LoginTableRow
                    key={row.studentId}
                    row={row}
                    canManage={canManage}
                    picked={picked.has(row.studentId)}
                    onToggle={() => toggle(row.studentId)}
                    onOpenStudent={onOpenStudent}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, total, note }: { label: string; value: number; total?: number; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">
        {value}
        {total !== undefined && <span className="text-base font-normal text-slate-400"> / {total}</span>}
      </div>
      {note && <div className="mt-0.5 text-xs text-slate-500">{note}</div>}
    </div>
  )
}

function LoginCell({ account }: { account: PortalAccount | null }) {
  if (!account) return <span className="text-slate-400">None yet</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-slate-700">{account.username}</span>
      {!account.isActive && <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">Off</span>}
    </span>
  )
}

function LoginTableRow({
  row,
  canManage,
  picked,
  onToggle,
  onOpenStudent,
}: {
  row: LoginRow
  canManage: boolean
  picked: boolean
  onToggle: () => void
  onOpenStudent?: (studentId: number) => void
}) {
  const missing = isMissing(row)
  return (
    <tr className={cn('border-b border-slate-50', picked && 'bg-pink-50/50')}>
      {canManage && (
        <td className="px-4 py-2">
          <input
            type="checkbox"
            checked={picked}
            disabled={!missing}
            onChange={onToggle}
            aria-label={`Pick ${row.studentName}`}
            className="h-4 w-4 accent-[#fc0c97]"
          />
        </td>
      )}
      <td className="px-4 py-2">
        {onOpenStudent ? (
          <button type="button" onClick={() => onOpenStudent(row.studentId)} className="font-semibold text-slate-900 hover:text-[#fc0c97]">
            {row.studentName}
          </button>
        ) : (
          <span className="font-semibold text-slate-900">{row.studentName}</span>
        )}
        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">{TYPE_LABELS[row.studentType]}</span>
        {!row.isActive && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-400">Deactivated</span>}
      </td>
      <td className="px-4 py-2">
        <LoginCell account={row.studentLogin} />
      </td>
      <td className="px-4 py-2">
        {row.parent ? (
          <>
            <div className={cn(row.parent.name ? 'text-slate-800' : 'italic text-slate-400')}>{row.parent.name || 'No name yet'}</div>
            {row.parent.phone && <div className="text-xs text-slate-500">{row.parent.phone}</div>}
          </>
        ) : (
          <span className="text-xs text-slate-400">Not linked</span>
        )}
      </td>
      <td className="px-4 py-2">{row.parent ? <LoginCell account={row.parentLogin} /> : <span className="text-slate-300">—</span>}</td>
    </tr>
  )
}

function NewLoginsPanel({ families, settings }: { families: SentFamily[]; settings: PortalSettings }) {
  const openChat = useOpenChat()
  const [copied, setCopied] = useState<string | null>(null)
  const message = (family: SentFamily) =>
    fillLoginMessage(settings.login_message, {
      school: settings.school_name,
      childNames: family.childNames,
      link: settings.app_url,
      logins: family.logins,
    })

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
    } catch {
      setCopied(null)
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([newLoginsCsv(families)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `app-logins-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const left = families.filter((family) => !family.opened).length

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-emerald-900">New logins to send</h3>
          <p className="text-sm text-emerald-800">
            Each password shows only here, until this page is reloaded. {left > 0 ? `${left} still to send.` : 'All opened in the Inbox.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900"
          >
            <DownloadSimple size={14} aria-hidden="true" />
            Download list
          </button>
          <button
            type="button"
            onClick={() => {
              if (left === 0 || window.confirm('Forget these passwords? Families who were not sent theirs will need a new password.')) clearNewLogins()
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900"
          >
            <X size={14} aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>
      <ul className="mt-3 grid gap-2 lg:grid-cols-2">
        {families.map((family) => (
          <li key={family.family} className="rounded-xl border border-emerald-200 bg-white p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{family.childNames.join(', ')}</div>
                <div className="text-xs text-slate-500">
                  {family.phone ? `To ${family.sendToName ?? ''} ${family.phone}` : family.contactId !== null ? `To ${family.sendToName ?? ''} (chat)` : 'No phone number or chat'}
                </div>
              </div>
              {family.opened && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle size={14} weight="fill" aria-hidden="true" />
                  Opened in Inbox
                </span>
              )}
            </div>
            <div className="mt-2 space-y-1 font-mono text-xs text-slate-700">
              {family.logins.map((login) => (
                <div key={login.username}>
                  {login.kind === 'parent' ? 'Parent' : login.name}: {login.username} / {login.password}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {openChat && (family.contactId !== null || family.phone) && (
                <button
                  type="button"
                  onClick={() => {
                    markOpened(family.family)
                    openChat({
                      phone: family.phone ?? '',
                      name: family.sendToName,
                      leadId: null,
                      chat: family.contactId !== null ? { conversationId: null, contactId: family.contactId } : undefined,
                      message: message(family),
                    })
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <WhatsappLogo size={14} weight="fill" aria-hidden="true" />
                  Open chat with message
                </button>
              )}
              <button
                type="button"
                onClick={() => void copy(family.family, message(family))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy size={14} aria-hidden="true" />
                {copied === family.family ? 'Copied' : 'Copy message'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
