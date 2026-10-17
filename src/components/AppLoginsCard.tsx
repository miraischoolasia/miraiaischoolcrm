import { useCallback, useEffect, useState } from 'react'
import { Copy, DeviceMobile } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import {
  consentKinds,
  createParentLogin,
  createStudentLogin,
  defaultConsentSettings,
  fetchStudentConsents,
  fetchStudentLogins,
  resetPortalPassword,
  setPortalLoginActive,
  type PortalAccount,
  type StudentConsent,
} from '../lib/portal'
import { formatDate } from '../domain/studentStatus'

type Logins = Awaited<ReturnType<typeof fetchStudentLogins>>

// The student app logins of a child and their parent: who has one, and (with
// Students edit) making one, a new password, or switching it off. A new
// password shows once, to copy and send to the family.
export function AppLoginsCard({
  studentId,
  studentName,
  canManage,
}: {
  studentId: number
  studentName: string
  canManage: boolean
}) {
  const [logins, setLogins] = useState<Logins | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // New passwords made while the card is open (each shows only once).
  const [shown, setShown] = useState<{ who: string; username: string; password: string }[]>([])
  const [copied, setCopied] = useState(false)
  // The parent's latest consent answers (null until loaded, or when they cannot be read).
  const [consents, setConsents] = useState<StudentConsent[] | null>(null)

  const load = useCallback(() => {
    fetchStudentLogins(studentId)
      .then(setLogins)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load the logins.'))
  }, [studentId])

  useEffect(load, [load])

  useEffect(() => {
    let cancelled = false
    fetchStudentConsents(studentId)
      .then((next) => !cancelled && setConsents(next))
      .catch(() => !cancelled && setConsents(null))
    return () => {
      cancelled = true
    }
  }, [studentId])

  async function run(who: string, action: Promise<{ ok: boolean; error?: string; username?: string; password?: string }>) {
    setBusy(true)
    setError(null)
    setCopied(false)
    const answer = await action
    setBusy(false)
    if (!answer.ok) {
      setError(answer.error ?? 'Something went wrong.')
      return
    }
    if (answer.username && answer.password) {
      const made = { who, username: answer.username, password: answer.password }
      setShown((current) => [...current.filter((entry) => entry.username !== made.username), made])
    }
    load()
  }

  async function copy() {
    if (shown.length === 0) return
    try {
      await navigator.clipboard.writeText(
        shown.map((entry) => `${entry.who}\nLogin: ${entry.username}\nPassword: ${entry.password}`).join('\n\n'),
      )
      setCopied(true)
    } catch {
      setError('Could not copy. Select the text instead.')
    }
  }

  const row = (
    who: string,
    account: PortalAccount | null,
    onCreate: (() => void) | null,
    missingNote?: string,
  ) => (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800">{who}</div>
        <div className={cn('text-xs', account ? 'text-slate-500' : 'text-slate-400')}>
          {account ? (
            <>
              Login: <span className="font-mono text-slate-700">{account.username}</span>
              {!account.isActive && <span className="ml-1 rounded bg-slate-100 px-1.5 text-slate-500">Off</span>}
            </>
          ) : (
            (missingNote ?? 'No login yet')
          )}
        </div>
      </div>
      {canManage && (
        <div className="flex gap-1.5">
          {!account && onCreate && (
            <button
              type="button"
              disabled={busy}
              onClick={onCreate}
              className="rounded-xl bg-[#fc0c97] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
            >
              Create login
            </button>
          )}
          {account && (
            <>
              <button
                type="button"
                disabled={busy || !account.isActive}
                onClick={() => void run(who, resetPortalPassword(account.authUserId))}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                New password
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(who, setPortalLoginActive(account.authUserId, !account.isActive))}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                {account.isActive ? 'Turn off' : 'Turn on'}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <DeviceMobile size={18} className="text-[#fc0c97]" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-slate-900">Student app</h3>
      </div>
      <p className="mt-1 text-sm text-slate-500">Logins for the student app: one for the child, one for the parent.</p>

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {shown.length > 0 && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="font-semibold">Send this to the family now (each password shows only once)</div>
          {shown.map((entry) => (
            <div key={entry.username} className="mt-2">
              <div className="font-semibold">{entry.who}</div>
              <div className="font-mono">Login: {entry.username}</div>
              <div className="font-mono">Password: {entry.password}</div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold"
          >
            <Copy size={14} aria-hidden="true" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {logins === null && !error && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
      {logins && (
        <ul className="mt-2 divide-y divide-slate-100">
          {row(studentName, logins.student, () => void run(studentName, createStudentLogin(studentId)))}
          {row(
            logins.parentPerson ? `${logins.parentPerson.name} (parent)` : 'Parent',
            logins.parent,
            logins.parentPerson ? () => void run(logins.parentPerson!.name, createParentLogin(logins.parentPerson!.id)) : null,
            logins.parentPerson ? undefined : 'No parent linked to this student yet (link one from the family card in the Inbox).',
          )}
        </ul>
      )}

      {consents && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parent's consent (answered in the app)</div>
          <ul className="mt-1 space-y-0.5 text-sm">
            {consentKinds.map((kind) => {
              const answer = consents.find((entry) => entry.kind === kind)
              return (
                <li key={kind} className="flex justify-between gap-2">
                  <span className="text-slate-700">{defaultConsentSettings[kind].title}</span>
                  <span className={cn(answer ? (answer.granted ? 'text-emerald-700' : 'text-rose-700') : 'text-slate-400')}>
                    {answer ? `${answer.granted ? 'Agreed' : 'Said no'} · ${formatDate(answer.at.slice(0, 10))}` : 'Not answered'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
