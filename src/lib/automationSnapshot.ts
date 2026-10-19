import { supabase } from './supabase'
import {
  DEFAULT_SEND_HOURS,
  DEFAULT_SETTINGS,
  fetchAutoSendRuleKeys,
  fetchQueue,
  fetchSendHours,
  fetchSentToday,
  fetchSettings,
  mapQueueRow,
  startOfDay,
  type AutomationSettings,
  type QueueItem,
  type SendHours,
} from './automationQueue'

// Everything the ⚡ window and the admin's Today show about the automation queue.
export type AutomationSnapshot = {
  queue: QueueItem[]
  settings: AutomationSettings
  sentToday: number
  // The flows that send by themselves ("flow_<id>").
  autoRuleKeys: ReadonlySet<string>
  sendHours: SendHours
}

const REFRESH_MS = 60_000

type SnapshotRow = {
  queue: Parameters<typeof mapQueueRow>[0][]
  settings: {
    paused: boolean
    daily_cap: number
    gap_seconds: number
    send_from_hour: number
    send_until_hour: number
  } | null
  sent_today: number
  auto_rule_keys: string[]
}

// Before the migration the function is not there: asked once, then the five reads are made as before.
let snapshotMissing = false

function isMissingFunction(error: { code?: string }) {
  return error.code === 'PGRST202' || error.code === '42883'
}

// The five reads one by one, as before automation_snapshot existed. Without the flows or the sending hours
// the window still works (every message just looks like it needs approval, which is the safe way round).
async function fetchOneByOne(now: number): Promise<AutomationSnapshot> {
  const [queue, settings, sentToday, autoRuleKeys, sendHours] = await Promise.all([
    fetchQueue(),
    fetchSettings(),
    fetchSentToday(now),
    fetchAutoSendRuleKeys().catch(() => new Set<string>()),
    fetchSendHours().catch(() => DEFAULT_SEND_HOURS),
  ])
  return { queue, settings: settings ?? DEFAULT_SETTINGS, sentToday, autoRuleKeys, sendHours }
}

// The same five things in one request. Any trouble with it falls back to the five reads, so what is
// shown (and any error) is exactly what it was before.
export async function fetchAutomationSnapshot(now = Date.now()): Promise<AutomationSnapshot> {
  if (!supabase || snapshotMissing) {
    return fetchOneByOne(now)
  }
  const { data, error } = await supabase.rpc('automation_snapshot', { p_since: startOfDay(now) })
  if (error || !data) {
    if (error && isMissingFunction(error)) {
      snapshotMissing = true
    }
    return fetchOneByOne(now)
  }
  const row = data as unknown as SnapshotRow
  return {
    queue: (row.queue ?? []).map(mapQueueRow),
    settings: row.settings
      ? { paused: row.settings.paused, dailyCap: row.settings.daily_cap, gapSeconds: row.settings.gap_seconds }
      : DEFAULT_SETTINGS,
    sentToday: Number(row.sent_today ?? 0),
    autoRuleKeys: new Set(row.auto_rule_keys ?? []),
    sendHours: row.settings
      ? { from: row.settings.send_from_hour, until: row.settings.send_until_hour }
      : DEFAULT_SEND_HOURS,
  }
}

export type SnapshotResult = { snapshot: AutomationSnapshot; error: null } | { snapshot: null; error: unknown }
type Listener = (result: SnapshotResult) => void

// One shared copy for the whole page: the ⚡ window and Today ask together, once a minute, only while the
// tab is looked at, and at once when it is looked at again.
const listeners = new Set<Listener>()
let inflight: Promise<AutomationSnapshot> | null = null
let timer: number | undefined
let started = 0

function notify(result: SnapshotResult) {
  for (const listener of [...listeners]) {
    listener(result)
  }
}

// Reads the queue and tells every part of the page that shows it. A read already on its way is shared,
// unless `fresh` asks for one started now (before sending, so the day's limit is current).
export function refreshAutomationSnapshot(fresh = false): Promise<AutomationSnapshot> {
  if (inflight && !fresh) {
    return inflight
  }
  // A read that started before a newer one never overwrites it (it may predate a change just made).
  started += 1
  const order = started
  const run = (async () => {
    try {
      const snapshot = await fetchAutomationSnapshot()
      if (order === started) {
        notify({ snapshot, error: null })
      }
      return snapshot
    } catch (error) {
      if (order === started) {
        notify({ snapshot: null, error })
      }
      throw error
    } finally {
      if (order === started) {
        inflight = null
      }
    }
  })()
  inflight = run
  return run
}

function refreshQuietly() {
  void refreshAutomationSnapshot().catch(() => undefined)
}

function onVisibility() {
  if (!document.hidden) {
    refreshQuietly()
  }
}

// Starts listening; the first listener starts the minute-by-minute check, the last one to leave stops it.
// Every new listener gets a read straight away.
export function subscribeAutomationSnapshot(listener: Listener): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    timer = window.setInterval(() => {
      if (!document.hidden) {
        refreshQuietly()
      }
    }, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibility)
  }
  refreshQuietly()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }
}

// For tests: forget that the function was found missing.
export function resetAutomationSnapshotForTests() {
  snapshotMissing = false
  inflight = null
}
