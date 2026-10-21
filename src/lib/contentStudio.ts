import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import {
  CONTENT_KINDS,
  CONTENT_SIZES,
  findBannedWords,
  type ContentKind,
  type ContentSize,
} from '../../supabase/functions/content-generate/logic'

// Content Studio (Marketing): briefs → an AI plan of posts → review → the Content Library, where staff claim
// a post to share on their own social media. Each school's database has its own settings, styles and angles.
// The AI part runs in the `content-generate` function; everything else is read and written here.

export { CONTENT_KINDS, CONTENT_SIZES, findBannedWords }
export type { ContentKind, ContentSize }

export const SIZE_LABELS: Record<ContentSize, string> = {
  '1:1': '1:1 Square (FB / IG post)',
  '4:5': '4:5 Portrait (IG post)',
  '9:16': '9:16 Story / Reels',
  '3:4': '3:4 Xiaohongshu',
}

export const KIND_LABELS: Record<ContentKind, string> = {
  single: 'Single poster',
  carousel: 'Carousel',
  caption: 'Caption only',
}

export type ContentProvider = 'gemini' | 'openai'

export type StudioSettings = {
  voice: string
  bannedWords: string[]
  mustInclude: string[]
  claimLimit: number
  dailyLimit: number
  textProvider: ContentProvider
  imageProvider: ContentProvider
}

export const DEFAULT_SETTINGS: StudioSettings = {
  voice: '',
  bannedWords: [],
  mustInclude: [],
  claimLimit: 3,
  dailyLimit: 60,
  textProvider: 'gemini',
  imageProvider: 'gemini',
}

export type StudioStyle = {
  id: number
  name: string
  description: string
  referencePaths: string[]
  hidden: boolean
}

export type StudioAngle = {
  id: number
  name: string
  description: string
  examples: string[]
  hidden: boolean
}

export type BriefFile = { path: string; name: string; type: string }

export type Brief = {
  id: number
  title: string
  topic: string
  keyPoints: string
  audience: string
  callToAction: string
  pdfText: string
  files: BriefFile[]
  styleIds: number[]
  angleIds: number[]
  itemCount: number
  sizes: ContentSize[]
  kind: ContentKind
  carouselPages: number
  archived: boolean
  createdAt: string
}

export type BriefDraft = Omit<Brief, 'id' | 'archived' | 'createdAt'>

export const EMPTY_BRIEF: BriefDraft = {
  title: '',
  topic: '',
  keyPoints: '',
  audience: '',
  callToAction: '',
  pdfText: '',
  files: [],
  styleIds: [],
  angleIds: [],
  itemCount: 6,
  sizes: ['1:1'],
  kind: 'single',
  carouselPages: 5,
}

export type ItemStatus = 'draft' | 'approved' | 'rejected'

export type PlanItem = {
  id: number
  briefId: number
  styleId: number | null
  angleId: number | null
  headline: string
  subheadline: string
  posterText: string
  caption: string
  visual: string
  size: ContentSize
  kind: ContentKind
  pages: number
  status: ItemStatus
  reviewNote: string
  reviewedAt: string | null
}

export type PlanItemEdit = Partial<Pick<PlanItem, 'headline' | 'subheadline' | 'posterText' | 'caption' | 'visual' | 'size'>>

export type LibraryItem = {
  id: number
  briefId: number
  briefTitle: string
  styleId: number | null
  styleName: string | null
  angleId: number | null
  angleName: string | null
  headline: string
  subheadline: string
  posterText: string
  caption: string
  size: ContentSize
  kind: ContentKind
  pages: number
  approvedAt: string | null
  claimedCount: number
  claimLimit: number
  myClaimedAt: string | null
}

export type ItemClaim = { itemId: number; teacherId: number; teacherName: string; claimedAt: string }

export type UsageRow = {
  id: number
  createdAt: string
  teacherId: number | null
  briefId: number | null
  action: string
  model: string
  units: number
  ok: boolean
  error: string | null
}

// The Content Studio tables are not in types/database.ts yet (a shared file, filled in when the migration
// is pushed), so they are read without its column types; the rows are typed here instead.
function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase as unknown as SupabaseClient
}

// A sentence for a person when the database says no (or the tables are not there yet).
export function contentErrorMessage(problem: unknown, fallback: string): string {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/content_(studio|styles|angles|briefs|items|claims|ai_usage|library)|claim_content_item/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Content Studio is not set up in the database yet.'
  }
  if (/row-level security|permission denied/i.test(text)) {
    return 'You do not have permission to do that.'
  }
  const code = typeof problem === 'object' && problem && 'code' in problem ? String((problem as { code: unknown }).code) : ''
  if (code === 'P0001' && text) {
    return text
  }
  return fallback
}

// ---- Claims -------------------------------------------------------------------------------------------------

export function isFullyClaimed(item: Pick<LibraryItem, 'claimedCount' | 'claimLimit' | 'myClaimedAt'>): boolean {
  return item.myClaimedAt === null && item.claimedCount >= item.claimLimit
}

// "2/3 claimed".
export function claimLabel(item: Pick<LibraryItem, 'claimedCount' | 'claimLimit'>): string {
  return `${Math.min(item.claimedCount, item.claimLimit)}/${item.claimLimit} claimed`
}

// What a staff member copies when claiming: the caption. Phase 2 adds the pictures to download.
export function claimText(item: Pick<LibraryItem, 'caption'>): string {
  return item.caption.trim()
}

// ---- Plan checks --------------------------------------------------------------------------------------------

// The banned words a plan row still has anywhere in its words.
export function bannedIn(item: Pick<PlanItem, 'headline' | 'subheadline' | 'posterText' | 'caption'>, banned: string[]): string[] {
  return findBannedWords([item.headline, item.subheadline, item.posterText, item.caption].join('\n'), banned)
}

// A list typed one per line (banned words also by commas).
export function splitLines(value: string, commas = false): string[] {
  const parts = commas ? value.split(/[\n,，、]/) : value.split('\n')
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed)
    }
  }
  return result
}

export type LibraryFilter = {
  briefId: number | null
  styleId: number | null
  angleId: number | null
  size: ContentSize | null
  // open = can still be claimed by me, mine = claimed by me.
  show: 'all' | 'open' | 'mine'
}

export const EMPTY_FILTER: LibraryFilter = { briefId: null, styleId: null, angleId: null, size: null, show: 'all' }

export function filterLibrary(items: LibraryItem[], filter: LibraryFilter): LibraryItem[] {
  return items.filter(
    (item) =>
      (filter.briefId === null || item.briefId === filter.briefId) &&
      (filter.styleId === null || item.styleId === filter.styleId) &&
      (filter.angleId === null || item.angleId === filter.angleId) &&
      (filter.size === null || item.size === filter.size) &&
      (filter.show === 'all' ||
        (filter.show === 'mine' && item.myClaimedAt !== null) ||
        (filter.show === 'open' && item.myClaimedAt === null && item.claimedCount < item.claimLimit)),
  )
}

// ---- Reading and writing ------------------------------------------------------------------------------------

type SettingsRow = {
  voice: string
  banned_words: string[]
  must_include: string[]
  claim_limit: number
  daily_limit: number
  text_provider: ContentProvider
  image_provider: ContentProvider
}

export async function fetchStudioSettings(): Promise<StudioSettings> {
  const { data, error } = await requireSupabase().from('content_studio_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw error
  const row = data as SettingsRow | null
  if (!row) return DEFAULT_SETTINGS
  return {
    voice: row.voice ?? '',
    bannedWords: row.banned_words ?? [],
    mustInclude: row.must_include ?? [],
    claimLimit: row.claim_limit ?? 3,
    dailyLimit: row.daily_limit ?? 60,
    textProvider: row.text_provider === 'openai' ? 'openai' : 'gemini',
    imageProvider: row.image_provider === 'openai' ? 'openai' : 'gemini',
  }
}

// Only the fields given are saved; limits and providers need an admin (the database checks).
export async function saveStudioSettings(change: Partial<StudioSettings>): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (change.voice !== undefined) payload.voice = change.voice
  if (change.bannedWords !== undefined) payload.banned_words = change.bannedWords
  if (change.mustInclude !== undefined) payload.must_include = change.mustInclude
  if (change.claimLimit !== undefined) payload.claim_limit = change.claimLimit
  if (change.dailyLimit !== undefined) payload.daily_limit = change.dailyLimit
  if (change.textProvider !== undefined) payload.text_provider = change.textProvider
  if (change.imageProvider !== undefined) payload.image_provider = change.imageProvider
  const { error } = await requireSupabase().rpc('save_content_studio_settings', { p: payload })
  if (error) throw error
}

type StyleRow = { id: number; name: string; description: string; reference_paths: string[]; hidden: boolean }
type AngleRow = { id: number; name: string; description: string; examples: string[]; hidden: boolean }

export async function fetchStyles(): Promise<StudioStyle[]> {
  const { data, error } = await requireSupabase()
    .from('content_styles')
    .select('id, name, description, reference_paths, hidden')
    .order('sort_order')
    .order('id')
  if (error) throw error
  return ((data ?? []) as StyleRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    referencePaths: row.reference_paths ?? [],
    hidden: row.hidden,
  }))
}

export async function fetchAngles(): Promise<StudioAngle[]> {
  const { data, error } = await requireSupabase()
    .from('content_angles')
    .select('id, name, description, examples, hidden')
    .order('sort_order')
    .order('id')
  if (error) throw error
  return ((data ?? []) as AngleRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    examples: row.examples ?? [],
    hidden: row.hidden,
  }))
}

export type StyleDraft = Pick<StudioStyle, 'name' | 'description' | 'referencePaths' | 'hidden'>
export type AngleDraft = Pick<StudioAngle, 'name' | 'description' | 'examples' | 'hidden'>

export async function saveStyle(id: number | null, draft: StyleDraft): Promise<void> {
  const row = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    reference_paths: draft.referencePaths,
    hidden: draft.hidden,
  }
  const client = requireSupabase()
  const { error } =
    id === null
      ? await client.from('content_styles').insert({ ...row, sort_order: Date.now() % 1000000 })
      : await client.from('content_styles').update(row).eq('id', id)
  if (error) throw error
}

export async function saveAngle(id: number | null, draft: AngleDraft): Promise<void> {
  const row = {
    name: draft.name.trim(),
    description: draft.description.trim(),
    examples: draft.examples.map((example) => example.trim()).filter(Boolean).slice(0, 3),
    hidden: draft.hidden,
  }
  const client = requireSupabase()
  const { error } =
    id === null
      ? await client.from('content_angles').insert({ ...row, sort_order: Date.now() % 1000000 })
      : await client.from('content_angles').update(row).eq('id', id)
  if (error) throw error
}

type BriefRow = {
  id: number
  title: string
  topic: string
  key_points: string
  audience: string
  call_to_action: string
  pdf_text: string
  files: BriefFile[]
  style_ids: number[]
  angle_ids: number[]
  item_count: number
  sizes: ContentSize[]
  kind: ContentKind
  carousel_pages: number
  archived: boolean
  created_at: string
}

function briefOf(row: BriefRow): Brief {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    keyPoints: row.key_points,
    audience: row.audience,
    callToAction: row.call_to_action,
    pdfText: row.pdf_text,
    files: Array.isArray(row.files) ? row.files : [],
    styleIds: row.style_ids ?? [],
    angleIds: row.angle_ids ?? [],
    itemCount: row.item_count,
    sizes: row.sizes ?? ['1:1'],
    kind: row.kind,
    carouselPages: row.carousel_pages,
    archived: row.archived,
    createdAt: row.created_at,
  }
}

function briefRowOf(draft: BriefDraft) {
  return {
    title: draft.title.trim(),
    topic: draft.topic,
    key_points: draft.keyPoints,
    audience: draft.audience,
    call_to_action: draft.callToAction,
    pdf_text: draft.pdfText,
    files: draft.files,
    style_ids: draft.styleIds,
    angle_ids: draft.angleIds,
    item_count: draft.itemCount,
    sizes: draft.sizes,
    kind: draft.kind,
    carousel_pages: draft.carouselPages,
  }
}

export async function fetchBriefs(): Promise<Brief[]> {
  const { data, error } = await requireSupabase().from('content_briefs').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return ((data ?? []) as BriefRow[]).map(briefOf)
}

export async function createBrief(draft: BriefDraft): Promise<Brief> {
  const { data, error } = await requireSupabase().from('content_briefs').insert(briefRowOf(draft)).select('*').single()
  if (error) throw error
  return briefOf(data as BriefRow)
}

export async function updateBrief(id: number, draft: BriefDraft): Promise<Brief> {
  const { data, error } = await requireSupabase().from('content_briefs').update(briefRowOf(draft)).eq('id', id).select('*').single()
  if (error) throw error
  return briefOf(data as BriefRow)
}

export async function setBriefArchived(id: number, archived: boolean): Promise<void> {
  const { error } = await requireSupabase().from('content_briefs').update({ archived }).eq('id', id)
  if (error) throw error
}

type ItemRow = {
  id: number
  brief_id: number
  style_id: number | null
  angle_id: number | null
  headline: string
  subheadline: string
  poster_text: string
  caption: string
  visual: string
  size: ContentSize
  kind: ContentKind
  pages: number
  status: ItemStatus
  review_note: string
  reviewed_at: string | null
}

function itemOf(row: ItemRow): PlanItem {
  return {
    id: row.id,
    briefId: row.brief_id,
    styleId: row.style_id,
    angleId: row.angle_id,
    headline: row.headline,
    subheadline: row.subheadline,
    posterText: row.poster_text,
    caption: row.caption,
    visual: row.visual,
    size: row.size,
    kind: row.kind,
    pages: row.pages,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
  }
}

// Plan rows of one brief, or of every brief with a given status (the review queue).
export async function fetchItems(query: { briefId?: number; status?: ItemStatus }): Promise<PlanItem[]> {
  let request = requireSupabase().from('content_items').select('*')
  if (query.briefId !== undefined) request = request.eq('brief_id', query.briefId)
  if (query.status !== undefined) request = request.eq('status', query.status)
  const { data, error } = await request.order('sort_order').order('id').limit(500)
  if (error) throw error
  return ((data ?? []) as ItemRow[]).map(itemOf)
}

export async function updateItem(id: number, edit: PlanItemEdit): Promise<void> {
  const row: Record<string, unknown> = {}
  if (edit.headline !== undefined) row.headline = edit.headline
  if (edit.subheadline !== undefined) row.subheadline = edit.subheadline
  if (edit.posterText !== undefined) row.poster_text = edit.posterText
  if (edit.caption !== undefined) row.caption = edit.caption
  if (edit.visual !== undefined) row.visual = edit.visual
  if (edit.size !== undefined) row.size = edit.size
  const { error } = await requireSupabase().from('content_items').update(row).eq('id', id)
  if (error) throw error
}

export async function reviewItems(ids: number[], status: ItemStatus, note = ''): Promise<void> {
  if (ids.length === 0) return
  const { error } = await requireSupabase().from('content_items').update({ status, review_note: note.slice(0, 500) }).in('id', ids)
  if (error) throw error
}

export async function deleteItem(id: number): Promise<void> {
  const { error, count } = await requireSupabase().from('content_items').delete({ count: 'exact' }).eq('id', id)
  if (error) throw error
  if (count === 0) {
    throw new Error('An approved or claimed post cannot be removed. Reject it instead.')
  }
}

type LibraryRow = {
  id: number
  brief_id: number
  brief_title: string
  style_id: number | null
  style_name: string | null
  angle_id: number | null
  angle_name: string | null
  headline: string
  subheadline: string
  poster_text: string
  caption: string
  size: ContentSize
  kind: ContentKind
  pages: number
  approved_at: string | null
  claimed_count: number
  claim_limit: number
  my_claimed_at: string | null
}

export async function fetchLibrary(): Promise<LibraryItem[]> {
  const { data, error } = await requireSupabase().rpc('content_library_items')
  if (error) throw error
  return ((data ?? []) as LibraryRow[]).map((row) => ({
    id: row.id,
    briefId: row.brief_id,
    briefTitle: row.brief_title,
    styleId: row.style_id,
    styleName: row.style_name,
    angleId: row.angle_id,
    angleName: row.angle_name,
    headline: row.headline,
    subheadline: row.subheadline,
    posterText: row.poster_text,
    caption: row.caption,
    size: row.size,
    kind: row.kind,
    pages: row.pages,
    approvedAt: row.approved_at,
    claimedCount: row.claimed_count,
    claimLimit: row.claim_limit,
    myClaimedAt: row.my_claimed_at,
  }))
}

export type ClaimResult = { already: boolean; claimedCount: number; claimLimit: number; claimedAt: string }

export async function claimItem(itemId: number): Promise<ClaimResult> {
  const { data, error } = await requireSupabase().rpc('claim_content_item', { p_item_id: itemId })
  if (error) throw error
  const row = data as { already: boolean; claimed_count: number; claim_limit: number; claimed_at: string }
  return { already: row.already, claimedCount: row.claimed_count, claimLimit: row.claim_limit, claimedAt: row.claimed_at }
}

export async function fetchClaims(itemIds: number[]): Promise<ItemClaim[]> {
  if (itemIds.length === 0) return []
  const { data, error } = await requireSupabase().rpc('content_item_claims', { p_item_ids: itemIds })
  if (error) throw error
  return ((data ?? []) as { item_id: number; teacher_id: number; teacher_name: string; claimed_at: string }[]).map((row) => ({
    itemId: row.item_id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    claimedAt: row.claimed_at,
  }))
}

export async function fetchUsageToday(): Promise<{ used: number; limit: number }> {
  const { data, error } = await requireSupabase().rpc('content_ai_today')
  if (error) throw error
  const row = data as { used?: number; limit?: number } | null
  return { used: row?.used ?? 0, limit: row?.limit ?? 60 }
}

export async function fetchUsage(limit = 50): Promise<UsageRow[]> {
  const { data, error } = await requireSupabase()
    .from('content_ai_usage')
    .select('id, created_at, teacher_id, brief_id, action, model, units, ok, error')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (
    (data ?? []) as {
      id: number
      created_at: string
      teacher_id: number | null
      brief_id: number | null
      action: string
      model: string
      units: number
      ok: boolean
      error: string | null
    }[]
  ).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    teacherId: row.teacher_id,
    briefId: row.brief_id,
    action: row.action,
    model: row.model,
    units: row.units,
    ok: row.ok,
    error: row.error,
  }))
}

// ---- Files --------------------------------------------------------------------------------------------------

export const CONTENT_BUCKET = 'content-files'
export const MAX_FILE_BYTES = 20 * 1024 * 1024
const FILE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

// Where a file goes: styles/<random>.<ext> or briefs/<brief id>/<random>.<ext>.
export function contentFilePath(folder: 'styles' | { briefId: number }, type: string, random: string): string | null {
  const ext = FILE_TYPES[type]
  if (!ext) return null
  const clean = random.replace(/[^A-Za-z0-9]/g, '').slice(0, 32) || 'file'
  return folder === 'styles' ? `styles/${clean}.${ext}` : `briefs/${folder.briefId}/${clean}.${ext}`
}

export async function uploadContentFile(folder: 'styles' | { briefId: number }, file: File): Promise<BriefFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That file is bigger than 20 MB.')
  }
  const path = contentFilePath(folder, file.type, crypto.randomUUID())
  if (!path) {
    throw new Error('Only PNG, JPG, WEBP pictures and PDF files can be added.')
  }
  const { error } = await requireSupabase().storage.from(CONTENT_BUCKET).upload(path, file, { contentType: file.type })
  if (error) throw error
  return { path, name: file.name.slice(0, 120), type: file.type }
}

export async function removeContentFile(path: string): Promise<void> {
  const { error } = await requireSupabase().storage.from(CONTENT_BUCKET).remove([path])
  if (error) throw error
}

// Short-lived links to show private pictures.
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (paths.length === 0) return result
  const { data, error } = await requireSupabase().storage.from(CONTENT_BUCKET).createSignedUrls(paths, 3600)
  if (error) throw error
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl)
  }
  return result
}

// ---- The AI -------------------------------------------------------------------------------------------------

async function messageOfFailure(failure: unknown, fallback: string): Promise<string> {
  const context = (failure as { context?: unknown } | null)?.context
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = (await (context as Response).clone().json()) as { error?: unknown }
      if (typeof body.error === 'string' && body.error) return body.error
    } catch {
      // Not JSON; use the general sentence.
    }
  }
  if (failure instanceof Error && /not found|FunctionsFetchError|Failed to send/i.test(failure.message)) {
    return 'The Content Studio AI is not switched on yet.'
  }
  return fallback
}

type AiAnswer<T> = { ok: true; value: T } | { ok: false; error: string }

async function callAi<T>(body: Record<string, unknown>, read: (data: Record<string, unknown>) => T): Promise<AiAnswer<T>> {
  const fallback = 'The AI did not answer. Try again in a moment.'
  try {
    const { data, error } = await requireSupabase().functions.invoke('content-generate', { body })
    if (error) return { ok: false, error: await messageOfFailure(error, fallback) }
    const answer = data as Record<string, unknown> | null
    if (!answer || answer.ok !== true) {
      return { ok: false, error: typeof answer?.error === 'string' && answer.error ? answer.error : fallback }
    }
    return { ok: true, value: read(answer) }
  } catch (problem) {
    return { ok: false, error: await messageOfFailure(problem, fallback) }
  }
}

export function generatePlan(briefId: number) {
  return callAi({ mode: 'plan', briefId }, (data) => ({
    added: typeof data.added === 'number' ? data.added : 0,
    warning: typeof data.warning === 'string' ? data.warning : '',
  }))
}

export function generateMore(briefId: number, count: number) {
  return callAi({ mode: 'more', briefId, count }, (data) => ({
    added: typeof data.added === 'number' ? data.added : 0,
    warning: typeof data.warning === 'string' ? data.warning : '',
  }))
}

export function readPdf(briefId: number, path: string) {
  return callAi({ mode: 'read_pdf', briefId, path }, (data) => (typeof data.text === 'string' ? data.text : ''))
}
