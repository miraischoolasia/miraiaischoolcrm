import { supabase } from './supabase'

// What a flow did, for its Enrollment history and Execution logs tabs.
//   * the messages it queued come from automation_queue (queued, approved, sent, failed, skipped, expired)
//   * the people it looked at and left alone come from automation_flow_log (written by the runner)

export type FlowLogKind =
  | 'stage_stopped'
  | 'cooldown'
  | 'condition_no'
  | 'no_message'
  | 'no_phone'
  | 'opted_out'
  | 'replied'
  | 'no_reply'
  | 'reply_branch'
  | 'action_done'
  | 'action_skipped'
  | 'channel_off'
  | 'keyword_matched'
  | 'weekly_limit'

export type FlowLogRow = {
  id: number
  eventKey: string
  nodeId: string
  kind: FlowLogKind
  detail: string | null
  phone: string | null
  parentName: string | null
  childName: string | null
  createdAt: string
}

export type FlowQueueRow = {
  id: number
  eventKey: string
  nodeId: string
  phone: string | null
  parentName: string | null
  childName: string | null
  message: string
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'expired'
  dueAt: string
  expiresAt: string | null
  createdAt: string
  decidedAt: string | null
  sentAt: string | null
  error: string | null
  autoBlocked: string | null
  sentByAutomation: boolean
}

// startedBy: runs a person started by hand from the Inbox ("+" > Start automation): event key ('manual:<id>') -> who.
export type FlowActivity = { queue: FlowQueueRow[]; log: FlowLogRow[]; startedBy?: Record<string, string> }

const QUEUE_COLUMNS =
  'id, dedupe_key, phone, parent_name, child_name, message, status, due_at, expires_at, created_at, decided_at, sent_at, error, auto_blocked, sent_by_automation'
const LOG_COLUMNS = 'id, event_key, node_id, kind, detail, phone, parent_name, child_name, created_at'
const LIMIT = 300

// 'flow:<flow id>:<block>:<event key>' -> the block and the event the message is about.
export function parseDedupeKey(key: string): { nodeId: string; eventKey: string } {
  const match = /^flow:\d+:([^:]+):(.*)$/.exec(key)
  return match ? { nodeId: match[1], eventKey: match[2] } : { nodeId: '', eventKey: key }
}

export async function fetchFlowActivity(flowId: number): Promise<FlowActivity> {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const [queue, log, starts] = await Promise.all([
    supabase
      .from('automation_queue')
      .select(QUEUE_COLUMNS)
      .eq('rule_key', `flow_${flowId}`)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase
      .from('automation_flow_log')
      .select(LOG_COLUMNS)
      .eq('flow_id', flowId)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase
      .from('chat_schedules')
      .select('id, created_by_name')
      .eq('kind', 'flow')
      .eq('flow_id', flowId)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ])
  if (queue.error) {
    throw queue.error
  }
  if (log.error) {
    throw log.error
  }
  // Who started a run by hand; left out (not an error) where the chat schedules cannot be read.
  const startedBy: Record<string, string> = {}
  for (const row of starts.error ? [] : (starts.data ?? [])) {
    startedBy[`manual:${row.id}`] = row.created_by_name || 'a team member'
  }
  return {
    startedBy,
    queue: (queue.data ?? []).map((row) => ({
      id: row.id,
      ...parseDedupeKey(row.dedupe_key),
      phone: row.phone,
      parentName: row.parent_name,
      childName: row.child_name,
      message: row.message,
      status: row.status,
      dueAt: row.due_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      sentAt: row.sent_at,
      error: row.error,
      autoBlocked: row.auto_blocked,
      sentByAutomation: row.sent_by_automation,
    })),
    log: (log.data ?? []).map((row) => ({
      id: row.id,
      eventKey: row.event_key,
      nodeId: row.node_id,
      kind: row.kind,
      detail: row.detail,
      phone: row.phone,
      parentName: row.parent_name,
      childName: row.child_name,
      createdAt: row.created_at,
    })),
  }
}

export function flowLogErrorMessage(problem: unknown) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/automation_flow_log/.test(text) && /(does not exist|schema cache)/.test(text)) {
    return 'The logs are not set up in the database yet.'
  }
  return "Couldn't load the logs."
}

// ---------------------------------------------------------------------------------------------
// Turning the rows into something a person can read
// ---------------------------------------------------------------------------------------------

export type Tone = 'ok' | 'info' | 'warn' | 'error'

export type TimelineEntry = {
  key: string
  at: string
  tone: Tone
  title: string
  detail: string | null
  // Child, or parent, or the phone.
  person: string
  eventKey: string
  // For the filter chips; 'other' is the steps in between (queued, sending, left for a person).
  group: 'sent' | 'problem' | 'skipped' | 'other'
}

const LOG_TITLES: Record<FlowLogKind, string> = {
  stage_stopped: 'Not sent: lead stage',
  cooldown: 'Not sent: messaged too recently',
  condition_no: 'Not sent: did not match a condition',
  no_message: 'Not sent: nothing to send',
  no_phone: 'Not sent: no phone number',
  opted_out: 'Not sent: parent wrote STOP',
  replied: 'Parent replied',
  no_reply: 'No reply in time',
  reply_branch: 'Reply checked',
  action_done: 'Step done',
  action_skipped: 'Step not done',
  channel_off: 'Not sent: wrong channel',
  keyword_matched: 'Wrote a keyword',
  weekly_limit: 'Not sent: weekly limit for this family',
}

// What a log row of each kind means for the filter chips: the three about replies are steps in between; a
// step that changed the lead counts as done.
const LOG_GROUPS: Record<FlowLogKind, TimelineEntry['group']> = {
  stage_stopped: 'skipped',
  cooldown: 'skipped',
  condition_no: 'skipped',
  no_message: 'skipped',
  no_phone: 'skipped',
  opted_out: 'skipped',
  replied: 'other',
  no_reply: 'other',
  reply_branch: 'other',
  action_done: 'sent',
  action_skipped: 'skipped',
  channel_off: 'skipped',
  keyword_matched: 'other',
  weekly_limit: 'skipped',
}

export function personLabel(row: { childName: string | null; parentName: string | null; phone: string | null }) {
  const child = row.childName?.trim()
  const parent = row.parentName?.trim()
  if (child && parent) {
    return `${child} (${parent})`
  }
  return child || parent || row.phone || 'Unknown'
}

function shorten(text: string, max = 140) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// One flow's story, newest first: every decision the runner made and every step a queued message took.
export function buildTimeline(activity: FlowActivity, now = Date.now()): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const row of activity.log) {
    entries.push({
      key: `log-${row.id}`,
      at: row.createdAt,
      tone: row.kind === 'no_phone' || row.kind === 'action_skipped' || row.kind === 'channel_off' ? 'warn' : row.kind === 'action_done' ? 'ok' : 'info',
      title: LOG_TITLES[row.kind],
      detail: row.detail,
      person: personLabel(row),
      eventKey: row.eventKey,
      group: LOG_GROUPS[row.kind],
    })
  }

  for (const row of activity.queue) {
    const person = personLabel(row)
    const base = { person, eventKey: row.eventKey }
    entries.push({
      key: `q-${row.id}-queued`,
      at: row.createdAt,
      tone: 'info',
      title: 'Message queued',
      detail: `Due ${formatWhen(row.dueAt)}. “${shorten(row.message)}”`,
      group: 'other',
      ...base,
    })
    if (row.autoBlocked) {
      entries.push({
        key: `q-${row.id}-blocked`,
        at: row.decidedAt ?? row.createdAt,
        tone: 'warn',
        title: 'Not sent by itself: left for a person',
        detail: row.autoBlocked,
        group: 'other',
        ...base,
      })
    }
    if (row.status === 'sent') {
      entries.push({
        key: `q-${row.id}-sent`,
        at: row.sentAt ?? row.decidedAt ?? row.createdAt,
        tone: 'ok',
        title: row.sentByAutomation ? 'Sent by itself' : 'Sent after a person approved it',
        detail: null,
        group: 'sent',
        ...base,
      })
    } else if (row.status === 'failed') {
      entries.push({
        key: `q-${row.id}-failed`,
        at: row.decidedAt ?? row.createdAt,
        tone: 'error',
        title: 'Failed to send',
        detail: row.error ?? 'No reason was given.',
        group: 'problem',
        ...base,
      })
    } else if (row.status === 'skipped') {
      entries.push({
        key: `q-${row.id}-skipped`,
        at: row.decidedAt ?? row.createdAt,
        tone: 'warn',
        title: 'Skipped by a person',
        detail: null,
        group: 'skipped',
        ...base,
      })
    } else if (row.status === 'expired' || (row.status === 'pending' && row.expiresAt && Date.parse(row.expiresAt) < now)) {
      entries.push({
        key: `q-${row.id}-expired`,
        at: row.expiresAt ?? row.createdAt,
        tone: 'warn',
        title: 'Expired before it was sent',
        detail: 'Nobody sent it in time, so it was dropped.',
        group: 'problem',
        ...base,
      })
    } else if (row.status === 'sending') {
      entries.push({
        key: `q-${row.id}-sending`,
        at: row.decidedAt ?? row.createdAt,
        tone: 'info',
        title: 'Sending now',
        detail: null,
        group: 'other',
        ...base,
      })
    }
  }

  return entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.key.localeCompare(a.key))
}

export type EnrollmentStatus = 'sent' | 'done' | 'waiting' | 'problem' | 'skipped' | 'not_sent'

export type Enrollment = {
  eventKey: string
  person: string
  phone: string | null
  enteredAt: string
  status: EnrollmentStatus
  label: string
  // The one-line reason or what happens next.
  reason: string | null
  messages: number
  steps: TimelineEntry[]
  // A person started this run by hand from the Inbox: their name.
  startedBy?: string | null
}

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  sent: 'Sent',
  done: 'Done',
  waiting: 'Waiting',
  problem: 'Needs a look',
  skipped: 'Skipped',
  not_sent: 'Not sent',
}

// Everyone who entered the flow, one row per person and event, newest first, with where they got to.
export function buildEnrollments(activity: FlowActivity, now = Date.now()): Enrollment[] {
  const timeline = buildTimeline(activity, now)
  const byEvent = new Map<string, TimelineEntry[]>()
  for (const entry of timeline) {
    byEvent.set(entry.eventKey, [...(byEvent.get(entry.eventKey) ?? []), entry])
  }
  const queueByEvent = new Map<string, FlowQueueRow[]>()
  for (const row of activity.queue) {
    queueByEvent.set(row.eventKey, [...(queueByEvent.get(row.eventKey) ?? []), row])
  }
  const logByEvent = new Map<string, FlowLogRow[]>()
  for (const row of activity.log) {
    logByEvent.set(row.eventKey, [...(logByEvent.get(row.eventKey) ?? []), row])
  }

  const enrollments: Enrollment[] = []
  for (const [eventKey, steps] of byEvent) {
    const queue = queueByEvent.get(eventKey) ?? []
    const log = logByEvent.get(eventKey) ?? []
    const first = queue[0] ?? log[0]
    const chronological = [...steps].reverse()

    let status: EnrollmentStatus
    let reason: string | null = null
    if (queue.length > 0) {
      const live = (row: FlowQueueRow) =>
        row.status === 'sending' ||
        (row.status === 'pending' && !(row.expiresAt && Date.parse(row.expiresAt) < now))
      const failed = queue.find((row) => row.status === 'failed')
      const waiting = queue.find(live)
      const sent = queue.filter((row) => row.status === 'sent')
      const expired = queue.find(
        (row) => row.status === 'expired' || (row.status === 'pending' && row.expiresAt && Date.parse(row.expiresAt) < now),
      )
      if (failed) {
        status = 'problem'
        reason = failed.error ?? 'Failed to send.'
      } else if (waiting) {
        status = 'waiting'
        reason = waiting.autoBlocked
          ? `Waiting for a person: ${waiting.autoBlocked}`
          : `Message due ${formatWhen(waiting.dueAt)}`
      } else if (sent.length > 0) {
        status = 'sent'
        reason = sent.length === 1 ? null : `${sent.length} messages sent`
      } else if (expired) {
        status = 'problem'
        reason = 'Expired before anyone sent it.'
      } else {
        status = 'skipped'
        reason = 'A person skipped it.'
      }
    } else if (log.some((row) => row.kind === 'action_done')) {
      // Nothing was messaged, but the flow changed the lead.
      status = 'done'
      reason = log.find((row) => row.kind === 'action_done')?.detail ?? null
    } else if (log.every((row) => row.kind === 'keyword_matched')) {
      // Only the words that started it are known so far: the steps are not due yet.
      status = 'waiting'
      reason = log[0]?.detail ?? null
    } else {
      const why = log.find((row) => row.kind !== 'keyword_matched')
      status = 'not_sent'
      reason = why?.detail ?? LOG_TITLES[why?.kind ?? 'no_message']
    }

    enrollments.push({
      eventKey,
      person: personLabel(first),
      phone: first.phone,
      enteredAt: chronological[0]?.at ?? first.createdAt,
      status,
      label: STATUS_LABELS[status],
      reason,
      messages: queue.length,
      steps: chronological,
      startedBy: activity.startedBy?.[eventKey] ?? null,
    })
  }

  return enrollments.sort((a, b) => Date.parse(b.enteredAt) - Date.parse(a.enteredAt))
}

export function formatWhen(iso: string) {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) {
    return iso
  }
  return new Date(time).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "12 min ago", for the last time the runner looked at the flow.
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) {
    return 'never'
  }
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}
