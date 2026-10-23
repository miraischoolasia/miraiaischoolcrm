import { supabase } from './supabase'
import { MAX_FILE_BYTES, MAX_VIDEO_BYTES } from './outbox'
import { MAX_QUICK_REPLY_FILE_BYTES, MAX_QUICK_REPLY_VIDEO_BYTES } from './quickReplies'

// Media > Galleries: the school's shared file library (20261101210000_galleries.sql). Files live in the public bucket
// gallery-files under a random folder, so a file's address cannot be guessed or listed; the rows say which folder
// and name it has. Deleting puts it in the Bin; "Delete forever" removes the file from storage, then the row.

export const GALLERY_BUCKET = 'gallery-files'

export type GalleryKind = 'image' | 'video' | 'audio' | 'document'

export type GalleryFolder = {
  id: number
  parentId: number | null
  name: string
  deletedAt: string | null
}

export type GalleryFile = {
  id: number
  folderId: number | null
  name: string
  path: string
  mime: string
  kind: GalleryKind
  sizeBytes: number
  uploadedByName: string | null
  createdAt: string
  deletedAt: string | null
  deletedByName: string | null
}

export type GalleryUsage = {
  maxFileMb: number
  quotaMb: number
  warnPercent: number
  usedBytes: number
  binBytes: number
  files: number
}

export type GalleryData = { folders: GalleryFolder[]; files: GalleryFile[] }

// Where a picked file is going: each has its own limits (WhatsApp's for the Inbox, the sender's for Automation).
export type GalleryUse = 'inbox' | 'automation' | 'quick_reply'

const MB = 1_048_576

// The Inbox sends what its own attach button takes (outbox.ts): videos up to 32 MB, other files up to 40 MB.
const INBOX_LIMITS: Record<GalleryKind, number> = {
  image: MAX_FILE_BYTES,
  video: MAX_VIDEO_BYTES,
  audio: MAX_FILE_BYTES,
  document: MAX_FILE_BYTES,
}

// An Automation message carries a picture up to 5 MB (as its own picture field).
const AUTOMATION_PICTURE_LIMIT = 5 * MB

const BLOCKED = new Set(['html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'exe', 'msi', 'bat', 'cmd', 'sh', 'ps1', 'php', 'apk', 'jar', 'scr', 'com'])

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

export function kindOf(mime: string): GalleryKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`
}

export function extensionOf(name: string) {
  const match = /\.([A-Za-z0-9]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

// A name that is safe in a storage address: letters, digits, dot, dash, underscore.
export function storageName(name: string) {
  const ext = extensionOf(name)
  const base = name.replace(/\.[A-Za-z0-9]+$/, '').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `${base || 'file'}${ext ? `.${ext}` : ''}`
}

export function publicUrl(path: string) {
  return requireSupabase().storage.from(GALLERY_BUCKET).getPublicUrl(path).data.publicUrl
}

// Why a file cannot be uploaded, or null.
export function uploadProblem(file: { name: string; size: number }, usage: GalleryUsage | null) {
  if (BLOCKED.has(extensionOf(file.name))) {
    return `${file.name}: web pages and programs cannot be kept in Galleries.`
  }
  if (usage && file.size > usage.maxFileMb * MB) {
    return `${file.name} is ${formatBytes(file.size)}; the largest file Galleries keeps is ${usage.maxFileMb} MB.`
  }
  if (usage && usage.usedBytes + file.size > usage.quotaMb * MB) {
    return `Galleries is full (${formatBytes(usage.usedBytes)} of ${usage.quotaMb} MB used). Empty the Bin or ask an admin for more space.`
  }
  return null
}

// Why a file cannot be used there, or null.
export function usableProblem(file: Pick<GalleryFile, 'kind' | 'sizeBytes'>, use: GalleryUse) {
  if (use === 'automation') {
    if (file.kind !== 'image') return 'An Automation message can only carry a picture.'
    if (file.sizeBytes > AUTOMATION_PICTURE_LIMIT) return 'An Automation picture can be up to 5 MB.'
    return null
  }
  if (use === 'quick_reply') {
    const limit = file.kind === 'video' ? MAX_QUICK_REPLY_VIDEO_BYTES : MAX_QUICK_REPLY_FILE_BYTES
    return file.sizeBytes > limit ? `A quick reply ${file.kind === 'video' ? 'video' : 'file'} can be up to ${limit / MB} MB.` : null
  }
  const limit = INBOX_LIMITS[file.kind]
  return file.sizeBytes > limit ? `The Inbox sends ${file.kind === 'video' ? 'videos' : 'files'} up to ${limit / MB} MB.` : null
}

export function usageLevel(usage: GalleryUsage): 'ok' | 'warn' | 'full' {
  const percent = (usage.usedBytes / (usage.quotaMb * MB)) * 100
  return percent >= 100 ? 'full' : percent >= usage.warnPercent ? 'warn' : 'ok'
}

// ---- reading

type FolderRow = { id: number; parent_id: number | null; name: string; deleted_at: string | null }
type FileRow = {
  id: number
  folder_id: number | null
  name: string
  path: string
  mime: string
  kind: GalleryKind
  size_bytes: number
  uploaded_by_name: string | null
  created_at: string
  deleted_at: string | null
  deleted_by_name: string | null
}

export async function fetchGallery(): Promise<GalleryData> {
  const db = requireSupabase()
  const [folders, files] = await Promise.all([
    db.from('gallery_folders').select('id, parent_id, name, deleted_at').order('name').limit(2000),
    db
      .from('gallery_files')
      .select('id, folder_id, name, path, mime, kind, size_bytes, uploaded_by_name, created_at, deleted_at, deleted_by_name')
      .order('created_at', { ascending: false })
      .limit(5000),
  ])
  if (folders.error) throw folders.error
  if (files.error) throw files.error
  return {
    folders: ((folders.data ?? []) as FolderRow[]).map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      deletedAt: row.deleted_at,
    })),
    files: ((files.data ?? []) as FileRow[]).map((row) => ({
      id: row.id,
      folderId: row.folder_id,
      name: row.name,
      path: row.path,
      mime: row.mime,
      kind: row.kind,
      sizeBytes: Number(row.size_bytes),
      uploadedByName: row.uploaded_by_name,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      deletedByName: row.deleted_by_name,
    })),
  }
}

function usageOf(raw: unknown): GalleryUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const num = (key: string, fallback: number) => (typeof value[key] === 'number' ? (value[key] as number) : Number(value[key] ?? fallback) || fallback)
  return {
    maxFileMb: num('max_file_mb', 50),
    quotaMb: num('quota_mb', 1000),
    warnPercent: num('warn_percent', 80),
    usedBytes: num('used_bytes', 0),
    binBytes: num('bin_bytes', 0),
    files: num('files', 0),
  }
}

export async function fetchUsage(): Promise<GalleryUsage | null> {
  const { data, error } = await requireSupabase().rpc('gallery_usage')
  if (error) throw error
  return usageOf(data)
}

export async function saveLimits(limits: Pick<GalleryUsage, 'maxFileMb' | 'quotaMb' | 'warnPercent'>) {
  const { error } = await requireSupabase().rpc('set_gallery_settings', {
    p_value: { max_file_mb: limits.maxFileMb, quota_mb: limits.quotaMb, warn_percent: limits.warnPercent },
  })
  if (error) throw error
}

// ---- changing

export async function uploadToGallery(file: File, folderId: number | null, usage: GalleryUsage | null): Promise<number> {
  const problem = uploadProblem(file, usage)
  if (problem) throw new Error(problem)
  const db = requireSupabase()
  const path = `${crypto.randomUUID()}/${storageName(file.name)}`
  const upload = await db.storage.from(GALLERY_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (upload.error) throw upload.error
  const { data, error } = await db.rpc('gallery_add_file', { p_path: path, p_name: file.name, p_folder_id: folderId as number })
  if (error) {
    await db.storage.from(GALLERY_BUCKET).remove([path]).catch(() => undefined)
    throw error
  }
  return data as number
}

export async function addFolder(name: string, parentId: number | null) {
  const { data, error } = await requireSupabase().rpc('gallery_add_folder', { p_name: name, p_parent_id: parentId as number })
  if (error) throw error
  return data as number
}

export async function renameItem(kind: 'file' | 'folder', id: number, name: string) {
  const { error } = await requireSupabase().rpc('gallery_rename', { p_kind: kind, p_id: id, p_name: name })
  if (error) throw error
}

export async function moveItems(fileIds: number[], folderIds: number[], to: number | null) {
  const { error } = await requireSupabase().rpc('gallery_move', { p_file_ids: fileIds, p_folder_ids: folderIds, p_to: to as number })
  if (error) throw error
}

export async function trashItems(fileIds: number[], folderIds: number[]) {
  const { error } = await requireSupabase().rpc('gallery_trash', { p_file_ids: fileIds, p_folder_ids: folderIds })
  if (error) throw error
}

export async function restoreItems(fileIds: number[], folderIds: number[]) {
  const { error } = await requireSupabase().rpc('gallery_restore', { p_file_ids: fileIds, p_folder_ids: folderIds })
  if (error) throw error
}

// Delete forever: the files leave storage first, then their rows (only things already in the Bin).
export async function deleteForever(files: GalleryFile[], folderIds: number[]) {
  const db = requireSupabase()
  const paths = files.map((file) => file.path)
  if (paths.length > 0) {
    const { error } = await db.storage.from(GALLERY_BUCKET).remove(paths)
    if (error) throw error
  }
  const { error } = await db.rpc('gallery_forget', { p_file_ids: files.map((file) => file.id), p_folder_ids: folderIds })
  if (error) throw error
}

// A picked file as a File, to attach in the Inbox or keep in a quick reply.
export async function fileFromGallery(file: Pick<GalleryFile, 'path' | 'name' | 'mime'>): Promise<File> {
  const response = await fetch(publicUrl(file.path))
  if (!response.ok) throw new Error(`Couldn't open ${file.name}.`)
  const blob = await response.blob()
  return new File([blob], file.name, { type: file.mime || blob.type })
}

export function galleryError(error: unknown, fallback = 'Something went wrong. Try again.') {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || message?.includes('gallery_')) {
    if (code !== '42501' && code !== '22023') {
      return 'Galleries is not set up yet. Ask the admin to update the database.'
    }
  }
  if (message && /row-level security|Unauthorized|not allowed/i.test(message)) {
    return 'You are not allowed to do this in Galleries.'
  }
  return message || fallback
}

// ---- reading the tree

export function liveFolders(data: GalleryData) {
  return data.folders.filter((folder) => folder.deletedAt === null)
}

export function liveFiles(data: GalleryData) {
  return data.files.filter((file) => file.deletedAt === null)
}

export function childFolders(data: GalleryData, parentId: number | null) {
  return liveFolders(data)
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function filesIn(data: GalleryData, folderId: number | null) {
  return liveFiles(data).filter((file) => file.folderId === folderId)
}

// The folders from the top down to this one, for the "Galleries / Photos / 2026" line.
export function folderTrail(data: GalleryData, folderId: number | null): GalleryFolder[] {
  const byId = new Map(data.folders.map((folder) => [folder.id, folder]))
  const trail: GalleryFolder[] = []
  let current = folderId === null ? undefined : byId.get(folderId)
  while (current && trail.length < 50) {
    trail.unshift(current)
    current = current.parentId === null ? undefined : byId.get(current.parentId)
  }
  return trail
}

// Every live folder with its full name ("Photos / 2026"), for the Move list.
export function folderChoices(data: GalleryData) {
  return liveFolders(data)
    .map((folder) => ({ id: folder.id, label: folderTrail(data, folder.id).map((entry) => entry.name).join(' / ') }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function searchFiles(data: GalleryData, words: string) {
  const query = words.trim().toLowerCase()
  if (query === '') return []
  return liveFiles(data).filter((file) => file.name.toLowerCase().includes(query))
}

export function binItems(data: GalleryData) {
  const deletedFolders = data.folders.filter((folder) => folder.deletedAt !== null)
  const deletedIds = new Set(deletedFolders.map((folder) => folder.id))
  return {
    // A folder deleted inside another deleted folder comes back with it: show only the outer one.
    folders: deletedFolders.filter((folder) => folder.parentId === null || !deletedIds.has(folder.parentId)),
    files: data.files.filter((file) => file.deletedAt !== null && (file.folderId === null || !deletedIds.has(file.folderId))),
    allFiles: data.files.filter((file) => file.deletedAt !== null),
    allFolders: deletedFolders,
  }
}

// A folder in the Bin with every folder and file deleted inside it, for "Delete forever".
export function binSubtree(data: GalleryData, folderId: number) {
  const folderIds = [folderId]
  for (let index = 0; index < folderIds.length; index += 1) {
    for (const folder of data.folders) {
      if (folder.parentId === folderIds[index] && folder.deletedAt !== null && !folderIds.includes(folder.id)) {
        folderIds.push(folder.id)
      }
    }
  }
  const files = data.files.filter((file) => file.deletedAt !== null && file.folderId !== null && folderIds.includes(file.folderId))
  return { folderIds, files }
}
