import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Content Studio pictures (phase 2). The database queues them (content_queue_images, content_edit_image) and
// the `content-images` function draws them in the background; the page shows each page's picture, how many
// are still being drawn, and lets the team draw again, change, choose, like or ask for high quality.

export type ImageStatus = 'queued' | 'working' | 'done' | 'failed'
export type ImageQuality = 'draft' | 'hd'

export type ContentImage = {
  id: number
  itemId: number
  page: number
  quality: ImageQuality
  status: ImageStatus
  instruction: string
  parentId: number | null
  path: string | null
  error: string | null
  chosen: boolean
  liked: boolean
  createdAt: string
}

type ImageRow = {
  id: number
  item_id: number
  page: number
  quality: ImageQuality
  status: ImageStatus
  instruction: string
  parent_id: number | null
  path: string | null
  error: string | null
  chosen: boolean
  liked: boolean
  created_at: string
}

// Not in types/database.ts yet (shared file); rows are typed here.
function client(): SupabaseClient {
  if (!supabase) throw new Error('Not connected to the database.')
  return supabase as unknown as SupabaseClient
}

function imageOf(row: ImageRow): ContentImage {
  return {
    id: row.id,
    itemId: row.item_id,
    page: row.page,
    quality: row.quality,
    status: row.status,
    instruction: row.instruction ?? '',
    parentId: row.parent_id,
    path: row.path,
    error: row.error,
    chosen: row.chosen,
    liked: row.liked,
    createdAt: row.created_at,
  }
}

export async function fetchImages(itemIds: number[]): Promise<ContentImage[]> {
  if (itemIds.length === 0) return []
  const { data, error } = await client().from('content_images').select('*').in('item_id', itemIds).order('id', { ascending: true })
  if (error) throw error
  return ((data ?? []) as ImageRow[]).map(imageOf)
}

// Starts the drawing in the background (it carries on by itself); a failure here is not shown, the page
// asks again while pictures are waiting.
export async function kickDrawing(): Promise<void> {
  try {
    await client().functions.invoke('content-images', { body: { mode: 'work' } })
  } catch {
    // The next check starts it again.
  }
}

export async function queueImages(itemIds: number[], quality: ImageQuality): Promise<number> {
  const { data, error } = await client().rpc('content_queue_images', { p_item_ids: itemIds, p_quality: quality })
  if (error) throw error
  if ((data as number) > 0) void kickDrawing()
  return (data as number) ?? 0
}

export async function editImage(imageId: number, instruction: string): Promise<void> {
  const { error } = await client().rpc('content_edit_image', { p_image_id: imageId, p_instruction: instruction })
  if (error) throw error
  void kickDrawing()
}

export async function chooseImage(imageId: number): Promise<void> {
  const { error } = await client().rpc('content_choose_image', { p_image_id: imageId })
  if (error) throw error
}

export async function likeImage(imageId: number, liked: boolean): Promise<void> {
  const { error } = await client().rpc('content_like_image', { p_image_id: imageId, p_liked: liked })
  if (error) throw error
}

export type LibraryImage = { itemId: number; page: number; path: string; quality: ImageQuality }

export async function fetchLibraryImages(itemIds: number[]): Promise<LibraryImage[]> {
  if (itemIds.length === 0) return []
  const { data, error } = await client().rpc('content_library_images', { p_item_ids: itemIds })
  if (error) throw error
  return ((data ?? []) as { item_id: number; page: number; path: string; quality: ImageQuality }[]).map((row) => ({
    itemId: row.item_id,
    page: row.page,
    path: row.path,
    quality: row.quality,
  }))
}

// ---- Working things out from the rows (no database) ------------------------------------------------------

// The picture shown for a page: the chosen one, else the newest finished one.
export function currentImage(images: ContentImage[], itemId: number, page: number): ContentImage | null {
  const done = images.filter((image) => image.itemId === itemId && image.page === page && image.status === 'done')
  return done.find((image) => image.chosen) ?? done[done.length - 1] ?? null
}

// A picture waiting or being drawn for this page, if any.
export function pendingImage(images: ContentImage[], itemId: number, page: number): ContentImage | null {
  return images.find((image) => image.itemId === itemId && image.page === page && (image.status === 'queued' || image.status === 'working')) ?? null
}

// The newest failure of a page that has nothing newer.
export function failedImage(images: ContentImage[], itemId: number, page: number): ContentImage | null {
  const mine = images.filter((image) => image.itemId === itemId && image.page === page)
  const last = mine[mine.length - 1]
  return last && last.status === 'failed' ? last : null
}

// Every finished version of a page, newest first.
export function versionsOf(images: ContentImage[], itemId: number, page: number): ContentImage[] {
  return images.filter((image) => image.itemId === itemId && image.page === page && image.status === 'done').reverse()
}

export type DrawingProgress = { waiting: number; done: number; failed: number }

// How far the drawing of these pictures is (only the newest picture of each page counts).
export function drawingProgress(images: ContentImage[]): DrawingProgress {
  const latest = new Map<string, ContentImage>()
  for (const image of images) latest.set(`${image.itemId}:${image.page}`, image)
  const progress = { waiting: 0, done: 0, failed: 0 }
  for (const image of latest.values()) {
    if (image.status === 'queued' || image.status === 'working') progress.waiting += 1
    else if (image.status === 'done') progress.done += 1
    else progress.failed += 1
  }
  return progress
}

// The file name a downloaded picture gets: "<title>-p2.png".
export function downloadName(title: string, page: number, pages: number, path: string): string {
  const ext = path.split('.').pop() ?? 'png'
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'post'
  return pages > 1 ? `${base}-p${page}.${ext}` : `${base}.${ext}`
}
