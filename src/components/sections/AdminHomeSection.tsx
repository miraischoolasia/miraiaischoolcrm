import { useMemo, useState } from 'react'
import { useNow } from '../../hooks/useNow'
import type { AutomationSummary } from '../../hooks/useAutomationSummary'
import { cn } from '../../lib/cn'
import {
  countUntouchedLeads,
  getLeadTasksDue,
  pickFollowUpStudents,
  summariseAttendance,
} from '../../lib/adminToday'
import type { StudentRow } from '../../lib/studentRows'
import { describeClassTiming, formatClockTime, type AgendaItem, type TeacherAgenda } from '../../lib/teacherAgenda'
import { parseLocalDate } from '../../domain/studentStatus'
import type { Lead } from '../../types/domain'
import { TeamRepliesCard, type TeamRepliesCardProps } from './TeamRepliesCard'

const PREVIEW = 5
const TODAY_PREVIEW = 8

export type AdminHomeSectionProps = {
  adminName: string
  todayString: string
  // For tests; otherwise the time moves on by itself.
  now?: Date
  isLoading?: boolean
  teacherNames: Map<number, string>
  // A block is only drawn when its data is given: null means this account has no access to it.
  agenda: TeacherAgenda | null
  studentRows: StudentRow[] | null
  leads: Lead[] | null
  // New form submissions since this browser last looked; null when the account has no Forms.
  unreadForms: number | null
  // Null when the WhatsApp inbox is not set up or this account has no Leads.
  whatsApp: { unread: number; waiting: number } | null
  // Null when this account cannot see the automations.
  automations: { summary: AutomationSummary | null; unavailable: boolean } | null
  canRenew: boolean
  // Admin only: how each person answers the WhatsApp chats. Null when it is not offered.
  teamReplies?: TeamRepliesCardProps | null
  onTakeAttendance: (item: AgendaItem) => void
  onOpenCalendar: () => void
  onOpenStudent: (studentId: number) => void
  onRenewStudent: (studentId: number) => void
  onOpenFollowUpStudents: () => void
  onOpenLeads: () => void
  onOpenLeadTasks: (leadId: number) => void
  onOpenForms: () => void
  onOpenWhatsApp: () => void
  onOpenAutomations: () => void
}

const chipClass = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700',
  info: 'bg-slate-100 text-slate-600',
}

function Chip({ tone, children }: { tone: keyof typeof chipClass; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', chipClass[tone])}>
      {children}
    </span>
  )
}

const primaryButton =
  'rounded-xl bg-[#fc0c97] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]'
const secondaryButton =
  'rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
const linkButton = 'text-sm font-semibold text-[#be185d] underline underline-offset-4'

function greeting(now: Date) {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function dayLabel(dateKey: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(
    parseLocalDate(dateKey),
  )
}

function daysBetween(fromKey: string, toKey: string) {
  return Math.round((parseLocalDate(toKey).getTime() - parseLocalDate(fromKey).getTime()) / 86_400_000)
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

function Block({
  id,
  title,
  summary,
  children,
}: {
  id: string
  title: string
  summary: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 id={id} className="text-lg font-semibold text-slate-900">
          {title}
        </h3>
        <p className="text-sm text-slate-500">{summary}</p>
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-4 text-sm text-slate-500">{children}</p>
}

export function AdminHomeSection({
  adminName,
  todayString,
  now: nowProp,
  isLoading = false,
  teacherNames,
  agenda,
  studentRows,
  leads,
  unreadForms,
  whatsApp,
  automations,
  canRenew,
  teamReplies = null,
  onTakeAttendance,
  onOpenCalendar,
  onOpenStudent,
  onRenewStudent,
  onOpenFollowUpStudents,
  onOpenLeads,
  onOpenLeadTasks,
  onOpenForms,
  onOpenWhatsApp,
  onOpenAutomations,
}: AdminHomeSectionProps) {
  const tick = useNow(30_000)
  const now = nowProp ?? tick
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(now).toLowerCase()
  const [showAllToday, setShowAllToday] = useState(false)
  const [showAllMissing, setShowAllMissing] = useState(false)

  const attendance = useMemo(() => (agenda ? summariseAttendance(agenda) : null), [agenda])
  const followUp = useMemo(() => (studentRows ? pickFollowUpStudents(studentRows) : null), [studentRows])
  const leadTasks = useMemo(() => (leads ? getLeadTasksDue(leads, todayString) : null), [leads, todayString])
  const untouchedLeads = useMemo(() => (leads ? countUntouchedLeads(leads) : 0), [leads])

  const teacherName = (id: number) => teacherNames.get(id) ?? 'Unknown teacher'
  const hasInbox = whatsApp !== null || automations !== null
  const hasAnything =
    attendance !== null || followUp !== null || leadTasks !== null || hasInbox || unreadForms !== null || teamReplies !== null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          {greeting(now)}, {adminName}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(
            parseLocalDate(todayString),
          )}{' '}
          · {time}
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {!isLoading && !hasAnything && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-600">
          Nothing to show yet. Ask your admin to tick what you can use.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {attendance && (
          <Block
            id="admin-classes-title"
            title="Classes today"
            summary={
              attendance.today.length === 0
                ? 'No classes today.'
                : `${plural(attendance.today.length, 'class', 'classes')} · ${attendance.submittedToday} attendance submitted`
            }
          >
            {attendance.today.length > 0 && (
              <ul className="divide-y divide-slate-200">
                {(showAllToday ? attendance.today : attendance.today.slice(0, TODAY_PREVIEW)).map((item) => {
                  const submitted = item.state === 'submitted'
                  const timing = describeClassTiming(item, now)
                  return (
                    <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {formatClockTime(item.startTime)}-{formatClockTime(item.endTime)} · {item.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {teacherName(item.teacherId)} · {plural(item.studentCount, 'student')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {submitted ? (
                          <Chip tone="ok">✓ Submitted</Chip>
                        ) : (
                          <Chip tone={timing.phase === 'upcoming' ? 'info' : 'warn'}>
                            {timing.phase === 'upcoming' ? timing.text : 'Not taken'}
                          </Chip>
                        )}
                        <button type="button" onClick={() => onTakeAttendance(item)} className={secondaryButton}>
                          {submitted ? 'View' : 'Attendance'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {attendance.today.length > TODAY_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllToday((current) => !current)}
                className="w-full border-t border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#be185d] transition hover:bg-[#fff8fc]"
              >
                {showAllToday ? 'Show fewer' : `Show all ${attendance.today.length}`}
              </button>
            )}

            <div className="border-t border-slate-200 px-4 py-3">
              {attendance.missingTotal === 0 ? (
                <p className="text-sm text-slate-500">No attendance is waiting from earlier days.</p>
              ) : (
                <>
                  <div className="text-sm font-semibold text-amber-800">
                    {plural(attendance.missingTotal, 'earlier class', 'earlier classes')} without attendance
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attendance.missingByTeacher.map((entry) => (
                      <Chip key={entry.teacherId} tone="warn">
                        {teacherName(entry.teacherId)} · {entry.count}
                      </Chip>
                    ))}
                  </div>
                </>
              )}
            </div>
            {agenda && agenda.todo.length > 0 && (
              <ul className="divide-y divide-slate-200 border-t border-slate-200">
                {(showAllMissing ? agenda.todo : agenda.todo.slice(0, PREVIEW)).map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {item.title} · {dayLabel(item.date)}
                      </div>
                      <div className="text-xs text-slate-500">{teacherName(item.teacherId)}</div>
                    </div>
                    <button type="button" onClick={() => onTakeAttendance(item)} className={primaryButton}>
                      Take attendance
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {agenda && agenda.todo.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllMissing((current) => !current)}
                className="w-full border-t border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#be185d] transition hover:bg-[#fff8fc]"
              >
                {showAllMissing ? 'Show fewer' : `Show all ${agenda.todo.length}`}
              </button>
            )}
            <div className="border-t border-slate-200 px-4 py-2.5">
              <button type="button" onClick={onOpenCalendar} className={linkButton}>
                Open full calendar
              </button>
            </div>
          </Block>
        )}

        {followUp && (
          <Block
            id="admin-students-title"
            title="Students to follow up"
            summary={
              followUp.total === 0
                ? 'Everyone is on track.'
                : `${followUp.total} need follow-up${followUp.critical > 0 ? ` · ${followUp.critical} urgent` : ''}`
            }
          >
            {followUp.total === 0 ? (
              <Empty>No package, class or fee is running out.</Empty>
            ) : (
              <ul className="divide-y divide-slate-200">
                {followUp.all.slice(0, PREVIEW).map(({ row, reason, critical }) => (
                  <li key={row.student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenStudent(row.student.id)}
                        className="text-left text-sm font-semibold text-slate-900 underline-offset-4 hover:underline"
                      >
                        {row.student.name}
                      </button>
                      <div className="text-xs text-slate-500">
                        {[row.classroom?.name, row.parent?.name, row.parent?.phone].filter(Boolean).join(' · ') ||
                          'No class yet'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip tone={critical ? 'bad' : 'warn'}>{reason}</Chip>
                      {canRenew && row.kind !== 'hoa' && (
                        <button type="button" onClick={() => onRenewStudent(row.student.id)} className={secondaryButton}>
                          Renew
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {followUp.total > PREVIEW && (
              <button
                type="button"
                onClick={onOpenFollowUpStudents}
                className="w-full border-t border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#be185d] transition hover:bg-[#fff8fc]"
              >
                See all {followUp.total}
              </button>
            )}
          </Block>
        )}

        {(leadTasks || unreadForms !== null) && (
          <Block
            id="admin-leads-title"
            title="Leads"
            summary={
              leadTasks
                ? leadTasks.length === 0
                  ? 'No lead tasks due.'
                  : `${plural(leadTasks.length, 'task')} due or late`
                : 'New form submissions'
            }
          >
            {leadTasks && leadTasks.length > 0 && (
              <ul className="divide-y divide-slate-200">
                {leadTasks.slice(0, PREVIEW).map((task) => {
                  const late = daysBetween(task.dueDate, todayString)
                  return (
                    <li
                      key={`${task.leadId}:${task.title}:${task.dueDate}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                        <div className="text-xs text-slate-500">{task.leadName}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Chip tone={task.overdue ? 'bad' : 'warn'}>
                          {task.overdue ? `${late} ${late === 1 ? 'day' : 'days'} late` : 'Due today'}
                        </Chip>
                        <button type="button" onClick={() => onOpenLeadTasks(task.leadId)} className={secondaryButton}>
                          Open
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {leadTasks && leadTasks.length > PREVIEW && (
              <button
                type="button"
                onClick={onOpenLeads}
                className="w-full border-t border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#be185d] transition hover:bg-[#fff8fc]"
              >
                Open Leads · {leadTasks.length - PREVIEW} more
              </button>
            )}
            <div className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3">
              {leads && (
                <button type="button" onClick={onOpenLeads} className={secondaryButton}>
                  {untouchedLeads} new {untouchedLeads === 1 ? 'lead' : 'leads'} with no follow-up
                </button>
              )}
              {unreadForms !== null && (
                <button type="button" onClick={onOpenForms} className={secondaryButton}>
                  {unreadForms} new form {unreadForms === 1 ? 'submission' : 'submissions'}
                </button>
              )}
            </div>
          </Block>
        )}

        {hasInbox && (
          <Block
            id="admin-inbox-title"
            title="WhatsApp & automations"
            summary="What is waiting for a reply or an approval."
          >
            <ul className="divide-y divide-slate-200">
              {whatsApp && (
                <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {plural(whatsApp.unread, 'unread chat')}
                    </div>
                    <div className="text-xs text-slate-500">
                      {whatsApp.waiting > 0 ? `${whatsApp.waiting} waiting over 30 minutes` : 'Nobody waiting over 30 minutes'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {whatsApp.waiting > 0 && <Chip tone="warn">{whatsApp.waiting} late</Chip>}
                    <button type="button" onClick={onOpenWhatsApp} className={primaryButton}>
                      Open WhatsApp
                    </button>
                  </div>
                </li>
              )}
              {automations && (
                <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  {automations.summary ? (
                    <>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {plural(automations.summary.waiting, 'message')} waiting for approval
                        </div>
                        <div className="text-xs text-slate-500">
                          Sent today {automations.summary.sentToday} of {automations.summary.settings.dailyCap}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {automations.summary.settings.paused && <Chip tone="warn">Paused</Chip>}
                        {automations.summary.failed > 0 && <Chip tone="bad">{automations.summary.failed} failed</Chip>}
                        <button type="button" onClick={onOpenAutomations} className={secondaryButton}>
                          Automations
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-slate-500">
                        {automations.unavailable ? 'Automations are not available right now.' : 'Loading automations…'}
                      </div>
                      <button type="button" onClick={onOpenAutomations} className={secondaryButton}>
                        Automations
                      </button>
                    </>
                  )}
                </li>
              )}
            </ul>
          </Block>
        )}

        {teamReplies && <TeamRepliesCard {...teamReplies} />}
      </div>
    </div>
  )
}
