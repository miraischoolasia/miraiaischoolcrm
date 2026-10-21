// A channel that has stopped working becomes an alert: the bar on top of Today and the Inbox says which one,
// what happened in plain words, and what to do next, so nobody has to notice it by missing messages.
// WhatsApp numbers: the WhatsApp server's checker (wa-watch) writes each number's status into whatsapp_numbers
// every 30 seconds; the CRM only reads it. Messenger's GHL link and Chatwoot can use the same bar later.

export type ChannelKind = 'whatsapp' | 'messenger' | 'instagram' | 'chatwoot' | 'other'

// What wa-watch writes (whatsapp_numbers.status). null: not checked yet, nothing shows.
export type WhatsAppStatus = 'connected' | 'reconnecting' | 'logged_out' | 'replaced' | 'restricted' | 'needs_qr' | 'quiet'

// 'unchecked': the checker itself has not reported for a while (an admin is told, since then nothing else would be).
// 'nobody_given': a locked (limited) channel no team or person is given, so only admins see its chats.
export type ChannelProblem = Exclude<WhatsAppStatus, 'connected'> | 'unchecked' | 'nobody_given'

export type ChannelAlert = {
  // Stays the same while the same problem goes on (it carries when it started), so hiding it lasts until it changes.
  key: string
  channel: ChannelKind
  // The channel's name on screen, e.g. "Second (60123456789)".
  name: string
  problem: ChannelProblem
  // When the problem started (ISO), or null when not known.
  since: string | null
  // WhatsApp: the number's Chatwoot inbox (its button in the Inbox) and Evolution name (its QR code).
  inboxId?: number | null
  instance?: string | null
  // The technical reason (e.g. "401 device_removed"), for an admin; may be empty.
  detail?: string | null
}

export type WhatsAppNumberStatus = {
  inboxId: number
  label: string
  phone: string | null
  instance: string | null
  isActive: boolean
  status: WhatsAppStatus | null
  reason: string | null
  changedAt: string | null
  checkedAt: string | null
  lastMessageAt: string | null
}

export const ALERT_RULES = {
  // The phone often reconnects by itself; only a longer try is shown (the server waits as long before it tells).
  reconnectingAfterMinutes: 10,
  // wa-watch looks every 30 seconds: no look for this long means the checker itself stopped.
  uncheckedAfterMinutes: 15,
}

const STATUSES: WhatsAppStatus[] = ['connected', 'reconnecting', 'logged_out', 'replaced', 'restricted', 'needs_qr', 'quiet']

export function parseWhatsAppStatus(value: unknown): WhatsAppStatus | null {
  return typeof value === 'string' && (STATUSES as string[]).includes(value) ? (value as WhatsAppStatus) : null
}

function minutesSince(iso: string | null, now: number) {
  if (!iso) {
    return null
  }
  const at = Date.parse(iso)
  return Number.isNaN(at) ? null : (now - at) / 60_000
}

export function numberName(label: string, phone: string | null) {
  return phone ? `${label} (${phone})` : label
}

// Red: the number cannot work until someone acts. Amber: it may be fine, but someone should look.
export function alertLevel(problem: ChannelProblem): 'danger' | 'warning' {
  return problem === 'reconnecting' || problem === 'quiet' || problem === 'unchecked' || problem === 'nobody_given'
    ? 'warning'
    : 'danger'
}

const RANK: Record<ChannelProblem, number> = {
  logged_out: 0,
  replaced: 1,
  restricted: 2,
  needs_qr: 3,
  reconnecting: 4,
  quiet: 5,
  unchecked: 6,
  nobody_given: 7,
}

// The alerts for the school's WhatsApp numbers. allowedInboxIds: the numbers this person works on (null = all,
// for an admin or a school that gives every number to everyone). isAdmin: only an admin hears that the checker
// stopped.
export function whatsAppNumberAlerts(
  numbers: WhatsAppNumberStatus[],
  allowedInboxIds: number[] | null,
  isAdmin: boolean,
  now = Date.now(),
  rules = ALERT_RULES,
): ChannelAlert[] {
  const alerts: ChannelAlert[] = []
  for (const number of numbers) {
    if (!number.isActive || number.status === null) {
      continue
    }
    if (allowedInboxIds !== null && !allowedInboxIds.includes(number.inboxId)) {
      continue
    }
    let problem: ChannelProblem | null = number.status === 'connected' ? null : number.status
    let since = number.status === 'quiet' ? (number.lastMessageAt ?? number.changedAt) : number.changedAt
    if (problem === 'reconnecting') {
      const minutes = minutesSince(number.changedAt, now)
      problem = minutes !== null && minutes >= rules.reconnectingAfterMinutes ? 'reconnecting' : null
    }
    if (!problem && isAdmin) {
      const unchecked = minutesSince(number.checkedAt, now)
      if (unchecked !== null && unchecked >= rules.uncheckedAfterMinutes) {
        problem = 'unchecked'
        since = number.checkedAt
      }
    }
    if (problem) {
      alerts.push({
        key: `whatsapp:${number.inboxId}:${problem}:${since ?? ''}`,
        channel: 'whatsapp',
        name: numberName(number.label, number.phone),
        problem,
        since,
        inboxId: number.inboxId,
        instance: number.instance,
        detail: number.reason,
      })
    }
  }
  return alerts.sort((a, b) => RANK[a.problem] - RANK[b.problem] || a.name.localeCompare(b.name))
}

const CHANNEL_WORD: Record<ChannelKind, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  chatwoot: 'The chat server',
  other: 'Channel',
}

// "for 5 minutes", "for 3 hours", "since Mon 20 Oct"; '' when not known.
export function howLong(iso: string | null, now = Date.now()) {
  const minutes = minutesSince(iso, now)
  if (minutes === null || minutes < 0) {
    return ''
  }
  if (minutes < 60) {
    const whole = Math.max(1, Math.round(minutes))
    return `for ${whole} minute${whole === 1 ? '' : 's'}`
  }
  const hours = minutes / 60
  if (hours < 48) {
    const whole = Math.round(hours)
    return `for ${whole} hour${whole === 1 ? '' : 's'}`
  }
  return `since ${new Date(Date.parse(iso as string)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
}

// "3 hours ago", "since Mon 20 Oct"; '' when not known.
function agoWords(iso: string | null, now: number) {
  const time = howLong(iso, now)
  return time.startsWith('for ') ? `${time.slice(4)} ago` : time
}

export type AlertWords = {
  title: string
  // What happened, in plain words.
  what: string
  // What to do next.
  next: string
  // Whether linking the phone again (the QR code) can fix it.
  scanFixes: boolean
}

export function alertWords(alert: ChannelAlert, now = Date.now()): AlertWords {
  const channel = CHANNEL_WORD[alert.channel]
  const time = howLong(alert.since, now)
  const ago = agoWords(alert.since, now)
  if (alert.problem === 'nobody_given') {
    return {
      title: `${channel} ${alert.name} is locked, and no staff can see it`,
      what: 'Only admins can see its chats now: no team with people in it, and no person, is given it. Staff see nothing from this channel in the Inbox.',
      next: 'Go to My Team, Teams, Inbox channels and give it a person or a team that has people in it (or set it to Open).',
      scanFixes: false,
    }
  }
  if (alert.channel !== 'whatsapp') {
    return {
      title: `${channel} ${alert.name} is not connected${time ? ` ${time}` : ''}`,
      what: 'Messages on this channel may not arrive in the CRM, and replies may not be sent.',
      next: 'Tell an admin to check the link of this channel.',
      scanFixes: false,
    }
  }
  const name = `WhatsApp ${alert.name}`
  switch (alert.problem) {
    case 'logged_out':
      return {
        title: `${name} is logged out`,
        what: `The phone was logged out of the CRM${ago ? ` ${ago}` : ''} (or the CRM was removed from its Linked devices). Messages to this number no longer come in, and replies cannot be sent from here.`,
        next: "Link it again: scan the QR code with this number's phone (WhatsApp, Settings, Linked devices, Link a device).",
        scanFixes: true,
      }
    case 'replaced':
      return {
        title: `${name} was opened somewhere else`,
        what: 'The same number was linked on another computer (WhatsApp Web or WhatsApp Desktop), which pushed the CRM out.',
        next: 'Close WhatsApp Web or WhatsApp Desktop on the other computer, then link the CRM again with the QR code.',
        scanFixes: true,
      }
    case 'restricted':
      return {
        title: `${name} has been restricted by WhatsApp`,
        what: 'WhatsApp has limited or banned this number, often after many messages to people who did not save it. Scanning the QR code will not help.',
        next: 'Open WhatsApp on that phone and read the warning there. Stop bulk and automatic sending from this number; if it is banned, follow the appeal steps WhatsApp shows.',
        scanFixes: false,
      }
    case 'needs_qr':
      return {
        title: `${name} is not linked yet`,
        what: 'This number has not been linked to the CRM, or its QR code ran out before it was scanned.',
        next: "Scan the QR code with this number's phone (WhatsApp, Settings, Linked devices, Link a device).",
        scanFixes: true,
      }
    case 'reconnecting':
      return {
        title: `${name} has been reconnecting ${time || 'for a while'}`,
        what: 'The link to the phone dropped and is trying to come back by itself. New messages may be late.',
        next: 'Check that the phone is on, has internet and WhatsApp is open. If it stays like this, scan the QR code again.',
        scanFixes: true,
      }
    case 'quiet':
      return {
        title: `No parent messages on ${name} ${time || 'for a long time'}`,
        what: 'The number says it is connected, but no message has come in for longer than usual during working hours.',
        next: 'Look at the phone: if it has new messages that are not in the CRM, scan the QR code again.',
        scanFixes: true,
      }
    case 'unchecked':
      return {
        title: `${name} has not been checked ${time || 'for a while'}`,
        what: "The WhatsApp server's number checker has stopped reporting, so a problem with this number would not show here.",
        next: 'Tell the server team that the WhatsApp number checker (wa-watch) has stopped.',
        scanFixes: false,
      }
  }
}

// A few words for a channel's button (the mark on it in the Inbox).
export function problemLabel(problem: ChannelProblem) {
  return {
    logged_out: 'Logged out',
    replaced: 'Opened somewhere else',
    restricted: 'Restricted by WhatsApp',
    needs_qr: 'Not linked',
    reconnecting: 'Reconnecting',
    quiet: 'No messages lately',
    unchecked: 'Not checked',
    nobody_given: 'No team given',
  }[problem]
}

// ---------------------------------------------------------------------------
// Locked channels nobody is given (admins only)

export type LockedChannelCheck = {
  inboxId: number
  label: string
  kind: 'whatsapp' | 'messenger' | 'instagram' | 'other'
  access: 'open' | 'limited'
  isActive: boolean
  // Active, non-admin staff given it in inbox_channel_access (directly, or in an active team).
  grants: number
  // Active, non-admin staff ticked for it in the older WhatsApp numbers list (whatsapp_number_staff), which still
  // counts: they see and answer it.
  numberStaff: number
  numberStaffIds?: number[]
}

// Who can really see each channel: active, non-admin people given it directly or through an active team, and the
// number's staff. A team switched off, or with nobody in it, gives nobody anything; admins see every channel anyway.
export function channelViewerChecks(input: {
  channels: Pick<LockedChannelCheck, 'inboxId' | 'label' | 'kind' | 'access' | 'isActive'>[]
  grants: { inboxId: number; teamId: number | null; teacherId: number | null }[]
  teams: { id: number; isActive: boolean }[]
  members: { teamId: number; teacherId: number }[]
  people: { id: number; isActive: boolean; isAdmin: boolean }[]
  numberStaff: { inboxId: number; teacherId: number }[]
}): LockedChannelCheck[] {
  const staff = new Set(input.people.filter((person) => person.isActive && !person.isAdmin).map((person) => person.id))
  const activeTeams = new Set(input.teams.filter((team) => team.isActive).map((team) => team.id))
  const viewers = new Map<number, Set<number>>()
  const numberViewers = new Map<number, Set<number>>()
  const add = (map: Map<number, Set<number>>, inboxId: number, ids: number[]) => {
    const set = map.get(inboxId) ?? new Set<number>()
    ids.filter((id) => staff.has(id)).forEach((id) => set.add(id))
    map.set(inboxId, set)
  }
  for (const grant of input.grants) {
    if (grant.teacherId !== null) {
      add(viewers, grant.inboxId, [grant.teacherId])
    } else if (grant.teamId !== null && activeTeams.has(grant.teamId)) {
      add(viewers, grant.inboxId, input.members.filter((member) => member.teamId === grant.teamId).map((member) => member.teacherId))
    }
  }
  for (const row of input.numberStaff) {
    add(numberViewers, row.inboxId, [row.teacherId])
  }
  return input.channels.map((channel) => {
    const numberStaffIds = [...(numberViewers.get(channel.inboxId) ?? [])]
    return { ...channel, grants: viewers.get(channel.inboxId)?.size ?? 0, numberStaff: numberStaffIds.length, numberStaffIds }
  })
}

// A limited channel that is on, and no staff can see it (no person, no team with someone in it, no number staff):
// only admins see its chats.
export function nobodyGiven(channel: Pick<LockedChannelCheck, 'access' | 'isActive' | 'grants' | 'numberStaff'>) {
  return channel.isActive && channel.access === 'limited' && channel.grants === 0 && channel.numberStaff === 0
}

export function lockedChannelAlerts(channels: LockedChannelCheck[]): ChannelAlert[] {
  return channels.filter(nobodyGiven).map((channel) => ({
    key: `access:${channel.inboxId}:nobody_given`,
    channel: channel.kind,
    name: channel.label,
    problem: 'nobody_given' as const,
    since: null,
  }))
}

// Told when someone changes who is given a channel (My Team, Teams, Inbox channels), so the bar looks again at once.
export const CHANNEL_ACCESS_CHANGED = 'crm:channel-access-changed'

// The address mark the "Open Inbox channels" button leaves: My Team opens on Teams and scrolls to Inbox channels.
export const CHANNEL_ACCESS_HASH = 'inbox-channels'

export function wantsChannelAccess() {
  return typeof window !== 'undefined' && window.location.hash === `#${CHANNEL_ACCESS_HASH}`
}
