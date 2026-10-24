import { supabase } from './supabase'

// The nightly WhatsApp label sync (⑤, migration 20261102800000_wa_label_sync): every night at 04:00 the CRM's tags and
// "Handled by" (PIC) are put on the chats of each WhatsApp number as WhatsApp Business labels. A number holds about 20
// labels, so each gets a budget: the "👤 <PIC>" labels first, then tags, most used first (or only the ticked ones).
// Admin only; off until an admin turns it on.

export type WaLabelSyncSettings = {
  enabled: boolean
  maxLabels: number
  picPrefix: string
  // A WhatsApp label colour, 0-19.
  picColor: number
  perNight: number
  gapSeconds: number
  // inbox id -> the ticked tag ids; a number left out is automatic (most used first).
  inboxes: Record<number, number[]>
}

export const DEFAULT_WA_LABEL_SYNC: WaLabelSyncSettings = {
  enabled: false,
  maxLabels: 20,
  picPrefix: '👤 ',
  picColor: 9,
  perNight: 300,
  gapSeconds: 3,
  inboxes: {},
}

// WhatsApp Business's 20 label colours, in WhatsApp's own order (close to what the phone shows).
export const WA_LABEL_COLORS = [
  '#ff9485', '#64c4ff', '#ffd429', '#dfaef0', '#99b6c1', '#55ccb3', '#ff9dff', '#d3a91d', '#6d7cce', '#d7e752',
  '#00d0e2', '#ffc5c7', '#93ceac', '#f74848', '#00a0f2', '#83e422', '#ffaf04', '#b5ebff', '#9ba6ff', '#9368cf',
]

export type WaLabelBudget = {
  maxLabels: number
  chats: number
  ticked: boolean
  picColor: number
  pics: { id: number; name: string; chats: number }[]
  tagsIn: { id: number; name: string; color: string | null; chats: number }[]
  tagsOut: { id: number; name: string; chats: number; why: 'full' | 'not ticked' }[]
}

export type WaLabelSyncRun = {
  inboxId: number
  startedAt: string
  finishedAt: string
  dryRun: boolean
  chatsPlanned: number
  chatsDone: number
  chatsNoNumber: number
  chatsFailed: number
  labelsAdded: number
  labelsRemoved: number
  labelsMade: string[]
  labelsMissing: string[]
  tagsLeftOut: string[]
  stopped: string | null
}

function whole(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) ? Math.min(Math.max(number, min), max) : fallback
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  // A name, or a {name} object, whichever the server wrote.
  return value
    .map((entry) => (typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? String((entry as { name?: unknown }).name ?? '') : ''))
    .filter(Boolean)
}

export function readWaLabelSync(value: unknown): WaLabelSyncSettings {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const inboxes: Record<number, number[]> = {}
  if (row.inboxes && typeof row.inboxes === 'object') {
    for (const [key, entry] of Object.entries(row.inboxes as Record<string, unknown>)) {
      const ids = entry && typeof entry === 'object' ? (entry as { tag_ids?: unknown }).tag_ids : null
      if (/^\d+$/.test(key) && Array.isArray(ids)) {
        inboxes[Number(key)] = ids.map(Number).filter(Number.isInteger)
      }
    }
  }
  return {
    enabled: row.enabled === true,
    maxLabels: whole(row.max_labels, DEFAULT_WA_LABEL_SYNC.maxLabels, 1, 60),
    picPrefix: typeof row.pic_prefix === 'string' ? row.pic_prefix : DEFAULT_WA_LABEL_SYNC.picPrefix,
    picColor: whole(row.pic_color, DEFAULT_WA_LABEL_SYNC.picColor, 0, 19),
    perNight: whole(row.per_night, DEFAULT_WA_LABEL_SYNC.perNight, 1, 2000),
    gapSeconds: whole(row.gap_seconds, DEFAULT_WA_LABEL_SYNC.gapSeconds, 1, 30),
    inboxes,
  }
}

export function waLabelSyncRow(settings: WaLabelSyncSettings) {
  return {
    enabled: settings.enabled,
    max_labels: settings.maxLabels,
    pic_prefix: settings.picPrefix,
    pic_color: settings.picColor,
    per_night: settings.perNight,
    gap_seconds: settings.gapSeconds,
    inboxes: Object.fromEntries(Object.entries(settings.inboxes).map(([inbox, ids]) => [inbox, { tag_ids: ids }])),
  }
}

// What is wrong before saving, or null (the database clamps the same).
export function waLabelSyncError(settings: WaLabelSyncSettings): string | null {
  if (!Number.isInteger(settings.maxLabels) || settings.maxLabels < 1 || settings.maxLabels > 60) {
    return 'Labels per number are 1 to 60.'
  }
  if ([...settings.picPrefix].length > 8) {
    return 'Keep the Handled-by prefix to 8 characters.'
  }
  if (!Number.isInteger(settings.perNight) || settings.perNight < 1 || settings.perNight > 2000) {
    return 'Chats per night are 1 to 2000.'
  }
  if (!Number.isInteger(settings.gapSeconds) || settings.gapSeconds < 1 || settings.gapSeconds > 30) {
    return 'The gap between chats is 1 to 30 seconds.'
  }
  return null
}

export function readWaLabelBudget(value: unknown): WaLabelBudget | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const row = value as Record<string, unknown>
  const list = (entry: unknown) => (Array.isArray(entry) ? (entry as Record<string, unknown>[]) : [])
  return {
    maxLabels: whole(row.max_labels, DEFAULT_WA_LABEL_SYNC.maxLabels, 1, 60),
    chats: whole(row.chats, 0, 0, Number.MAX_SAFE_INTEGER),
    ticked: row.ticked === true,
    picColor: whole(row.pic_color, DEFAULT_WA_LABEL_SYNC.picColor, 0, 19),
    pics: list(row.pics).map((pic) => ({ id: Number(pic.id), name: String(pic.name ?? ''), chats: Number(pic.chats ?? 0) })),
    tagsIn: list(row.tags_in).map((tag) => ({
      id: Number(tag.id),
      name: String(tag.name ?? ''),
      color: typeof tag.color === 'string' ? tag.color : null,
      chats: Number(tag.chats ?? 0),
    })),
    tagsOut: list(row.tags_out).map((tag) => ({
      id: Number(tag.id),
      name: String(tag.name ?? ''),
      chats: Number(tag.chats ?? 0),
      why: tag.why === 'not ticked' ? 'not ticked' : 'full',
    })),
  }
}

export function readWaLabelSyncRun(row: {
  inbox_id: number
  started_at: string
  finished_at: string
  dry_run: boolean
  summary: unknown
}): WaLabelSyncRun {
  const summary = row.summary && typeof row.summary === 'object' ? (row.summary as Record<string, unknown>) : {}
  const count = (key: string) => whole(summary[key], 0, 0, Number.MAX_SAFE_INTEGER)
  return {
    inboxId: row.inbox_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    dryRun: row.dry_run,
    chatsPlanned: count('chats_planned'),
    chatsDone: count('chats_done'),
    chatsNoNumber: count('chats_no_number'),
    chatsFailed: count('chats_failed'),
    labelsAdded: count('labels_added'),
    labelsRemoved: count('labels_removed'),
    labelsMade: names(summary.labels_made),
    labelsMissing: names(summary.labels_missing),
    tagsLeftOut: names(summary.tags_left_out),
    stopped: typeof summary.stopped === 'string' && summary.stopped ? summary.stopped : null,
  }
}

function missingUpdate(code: string | undefined) {
  return code === 'PGRST202' || code === '42883' || code === 'PGRST205' || code === '42P01'
}

// null settings = the database update is not there yet.
export async function fetchWaLabelSync(): Promise<{ settings: WaLabelSyncSettings | null; error: string | null }> {
  if (!supabase) {
    return { settings: null, error: 'Supabase is not configured.' }
  }
  const { data, error } = await supabase.rpc('wa_label_sync_settings' as never)
  if (error) {
    return { settings: null, error: missingUpdate(error.code) ? 'WhatsApp labels need the database update first.' : error.message }
  }
  return { settings: readWaLabelSync(data), error: null }
}

// Resolves to the saved settings, or an error message.
export async function saveWaLabelSync(settings: WaLabelSyncSettings): Promise<WaLabelSyncSettings | string> {
  const problem = waLabelSyncError(settings)
  if (problem) {
    return problem
  }
  if (!supabase) {
    return 'Supabase is not configured.'
  }
  const { data, error } = await supabase.rpc('wa_label_sync_save_settings' as never, { p_value: waLabelSyncRow(settings) } as never)
  if (error) {
    if (error.code === '42501') {
      return 'Only an admin can change this.'
    }
    return missingUpdate(error.code) ? 'WhatsApp labels need the database update first.' : error.message || 'Failed to save.'
  }
  return readWaLabelSync(data)
}

export async function fetchWaLabelBudget(inboxId: number): Promise<WaLabelBudget | null> {
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase.rpc('wa_label_budget' as never, { p_inbox_id: inboxId } as never)
  return error ? null : readWaLabelBudget(data)
}

// The latest night's report of each number.
export async function fetchLatestWaLabelRuns(): Promise<Map<number, WaLabelSyncRun>> {
  const result = new Map<number, WaLabelSyncRun>()
  if (!supabase) {
    return result
  }
  const { data, error } = await supabase
    .from('wa_label_sync_runs' as never)
    .select('inbox_id, started_at, finished_at, dry_run, summary')
    .order('finished_at', { ascending: false })
    .limit(100)
  if (error || !data) {
    return result
  }
  for (const row of data as unknown as Parameters<typeof readWaLabelSyncRun>[0][]) {
    if (!result.has(row.inbox_id)) {
      result.set(row.inbox_id, readWaLabelSyncRun(row))
    }
  }
  return result
}
