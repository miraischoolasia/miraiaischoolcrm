import { supabase } from '../lib/supabase'
import { LANDING_DATA_VERSION, PUCK_VERSION, type LandingData } from './landingData'

// Reading and saving landing pages (migration 20261101600000_landing_pages.sql). The tables are newer than
// src/types/database.ts, so the calls go through a loosely typed client.

export type LandingPageStatus = 'draft' | 'published' | 'unpublished'

export type LandingPageRow = {
  id: string
  slug: string
  title: string
  status: LandingPageStatus
  views: number
  data_version: number
  published_data_version: number | null
  published_at: string | null
  updated_at: string
  created_at: string
}

export type LandingPageFull = LandingPageRow & {
  draft_data: unknown
}

export type PublishedLandingPage = {
  id: string
  slug: string
  title: string
  data: unknown
  data_version: number | null
  seo_title: string
  seo_description: string
  share_image_url: string
}

type Result<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>
type Loose = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => Result<LandingPageRow[]>
      eq: (column: string, value: string) => { maybeSingle: () => Result<LandingPageFull> }
    }
    insert: (row: object) => { select: (columns: string) => { single: () => Result<LandingPageRow> } }
    update: (row: object) => { eq: (column: string, value: string) => Result<null> }
    delete: () => { eq: (column: string, value: string) => Result<null> }
  }
  rpc: (name: string, args: object) => Result<unknown>
}

const LIST_COLUMNS = 'id, slug, title, status, views, data_version, published_data_version, published_at, updated_at, created_at'

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase as unknown as Loose
}

function failure(error: { message: string; code?: string }) {
  if (error.code === '23505') {
    return new Error('这个网址已经有页面在用，请换一个。')
  }
  return new Error(error.message)
}

export async function listLandingPages() {
  const { data, error } = await client().from('landing_pages').select(LIST_COLUMNS).order('updated_at', { ascending: false })
  if (error) {
    throw failure(error)
  }
  return data ?? []
}

export async function loadLandingPage(id: string) {
  const { data, error } = await client().from('landing_pages').select(`${LIST_COLUMNS}, draft_data`).eq('id', id).maybeSingle()
  if (error) {
    throw failure(error)
  }
  return data
}

// The draft of a page by its address, for "Preview" (signed in, with the Landing Page tick).
export async function loadLandingDraftBySlug(slug: string) {
  const { data, error } = await client().from('landing_pages').select(`${LIST_COLUMNS}, draft_data`).eq('slug', slug).maybeSingle()
  if (error) {
    throw failure(error)
  }
  return data
}

export async function createLandingPage(title: string, slug: string, data: LandingData) {
  const { data: row, error } = await client()
    .from('landing_pages')
    .insert({ title: title.trim(), slug, draft_data: data, data_version: LANDING_DATA_VERSION, puck_version: PUCK_VERSION })
    .select(LIST_COLUMNS)
    .single()
  if (error || !row) {
    throw failure(error ?? { message: 'The page was not made.' })
  }
  return row
}

export async function saveLandingDraft(id: string, data: LandingData) {
  const { error } = await client()
    .from('landing_pages')
    .update({ draft_data: data, data_version: LANDING_DATA_VERSION, puck_version: PUCK_VERSION })
    .eq('id', id)
  if (error) {
    throw failure(error)
  }
}

export async function updateLandingPageInfo(id: string, changes: { title?: string; slug?: string; status?: LandingPageStatus }) {
  const { error } = await client().from('landing_pages').update(changes).eq('id', id)
  if (error) {
    throw failure(error)
  }
}

export async function publishLandingPage(id: string) {
  const { error } = await client().rpc('publish_landing_page', { p_id: id })
  if (error) {
    throw failure(error)
  }
}

export async function deleteLandingPage(id: string) {
  const { error } = await client().from('landing_pages').delete().eq('id', id)
  if (error) {
    throw failure(error)
  }
}

// For parents: the published page, or null when there is none at this address (or it was taken down).
export async function fetchPublishedLandingPage(slug: string) {
  const { data, error } = await client().rpc('get_published_landing_page', { p_slug: slug })
  if (error) {
    throw failure(error)
  }
  return (data as PublishedLandingPage | null) ?? null
}

export async function recordLandingView(slug: string) {
  await client().rpc('record_landing_view', { p_slug: slug })
}
