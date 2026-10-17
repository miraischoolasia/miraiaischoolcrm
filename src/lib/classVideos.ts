import { supabase } from './supabase'

// A class's videos on Bunny Stream (20261022100000_multi_class_and_videos.sql
// and the class-videos function): the list, a teacher's upload, month access
// and who watched.

export type ClassVideoStatus = 'uploading' | 'processing' | 'ready' | 'failed'

export type ClassVideo = {
  id: number
  classroomId: number
  teacherId: number | null
  title: string
  description: string | null
  year: number
  month: number
  lessonDate: string | null
  libraryId: string
  videoId: string
  status: ClassVideoStatus
  source: 'upload' | 'zoom' | 'import'
  views: number
  isArchived: boolean
  createdAt: string
}

export type VideoProgress = {
  studentId: number
  videoId: number
  percentage: number
  completed: boolean
  rewatches: number
  lastWatchedAt: string
}

export type VideoAccess = {
  studentId: number
  year: number
  month: number
  startsOn: string | null
  endsOn: string | null
}

export type VideoDraft = {
  title: string
  description: string
  year: number
  month: number
  lessonDate: string
}

export const videoStatusLabels: Record<ClassVideoStatus, string> = {
  uploading: 'Uploading',
  processing: 'Bunny is processing',
  ready: 'Ready',
  failed: 'Failed',
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(year: number, month: number) {
  return `${monthNames[month - 1] ?? month} ${year}`
}

export function videoEmbedUrl(video: Pick<ClassVideo, 'libraryId' | 'videoId'>) {
  return `https://player.mediadelivery.net/embed/${video.libraryId}/${video.videoId}`
}

// Videos by month, newest month first; inside a month by lesson day, then added.
export function groupByMonth(videos: ClassVideo[]) {
  const groups = new Map<string, { year: number; month: number; videos: ClassVideo[] }>()
  const sorted = [...videos].sort(
    (a, b) =>
      b.year - a.year ||
      b.month - a.month ||
      (a.lessonDate ?? '').localeCompare(b.lessonDate ?? '') ||
      a.createdAt.localeCompare(b.createdAt),
  )
  for (const video of sorted) {
    const key = `${video.year}-${video.month}`
    const group = groups.get(key) ?? { year: video.year, month: video.month, videos: [] }
    group.videos.push(video)
    groups.set(key, group)
  }
  return [...groups.values()]
}

// Is a month open for a student today? (Mirrors student_can_watch_video.)
export function isMonthOpen(access: VideoAccess[], studentId: number, year: number, month: number, today: string) {
  return access.some(
    (row) =>
      row.studentId === studentId &&
      row.year === year &&
      row.month === month &&
      (row.startsOn === null || row.startsOn <= today) &&
      (row.endsOn === null || today <= row.endsOn),
  )
}

// How many of the class's students opened and finished a video.
export function videoStats(progress: VideoProgress[], videoId: number) {
  const rows = progress.filter((row) => row.videoId === videoId)
  return { watched: rows.length, completed: rows.filter((row) => row.completed).length }
}

function failure(error: { message?: string } | null, fallback: string) {
  return error ? error.message || fallback : null
}

export async function fetchClassVideos(classroomId: number): Promise<ClassVideo[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('class_videos')
    .select('id, classroom_id, teacher_id, title, description, year, month, lesson_date, bunny_library_id, bunny_video_id, status, source, views, is_archived, created_at')
    .eq('classroom_id', classroomId)
  if (error) {
    // Before the class videos migration the table does not exist.
    if (error.code === 'PGRST205' || error.code === '42P01') throw new Error('Class videos need the database update first.')
    throw new Error(error.message)
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    classroomId: row.classroom_id,
    teacherId: row.teacher_id,
    title: row.title,
    description: row.description,
    year: row.year,
    month: row.month,
    lessonDate: row.lesson_date,
    libraryId: row.bunny_library_id,
    videoId: row.bunny_video_id,
    status: row.status,
    source: row.source,
    views: row.views,
    isArchived: row.is_archived,
    createdAt: row.created_at,
  }))
}

export async function fetchVideoProgress(videoIds: number[]): Promise<VideoProgress[]> {
  if (!supabase || videoIds.length === 0) return []
  const { data, error } = await supabase
    .from('class_video_progress')
    .select('student_id, video_id, watch_percentage, rewatch_count, completed_at, last_watched_at')
    .in('video_id', videoIds)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    studentId: row.student_id,
    videoId: row.video_id,
    percentage: Number(row.watch_percentage),
    completed: row.completed_at !== null,
    rewatches: row.rewatch_count,
    lastWatchedAt: row.last_watched_at,
  }))
}

export async function fetchVideoAccess(classroomId: number): Promise<VideoAccess[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('student_video_access')
    .select('student_id, year, month, starts_on, ends_on')
    .eq('classroom_id', classroomId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    studentId: row.student_id,
    year: row.year,
    month: row.month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  }))
}

export async function fetchMonthAccessOn(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'class_videos').maybeSingle()
  return (data?.value as { month_access?: unknown } | null)?.month_access === true
}

export async function saveMonthAccessOn(value: boolean) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_class_video_settings', { p_month_access: value })
  return failure(error, 'Could not save.')
}

export async function fetchCanManageVideos(classroomId: number) {
  if (!supabase) return false
  const { data } = await supabase.rpc('can_manage_class_videos', { p_classroom_id: classroomId })
  return data === true
}

export async function updateClassVideo(id: number, draft: VideoDraft) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('update_class_video', {
    p_id: id,
    p_title: draft.title.trim(),
    p_description: draft.description.trim() || null,
    p_year: draft.year,
    p_month: draft.month,
    p_lesson_date: draft.lessonDate || null,
  })
  return failure(error, 'Could not save the video.')
}

export async function setClassVideoArchived(id: number, archived: boolean) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_class_video_archived', { p_id: id, p_archived: archived })
  return failure(error, 'Could not save.')
}

export async function setStudentVideoAccess(
  studentId: number,
  classroomId: number,
  year: number,
  month: number,
  granted: boolean,
  startsOn: string | null = null,
  endsOn: string | null = null,
) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_student_video_access', {
    p_student_id: studentId,
    p_classroom_id: classroomId,
    p_year: year,
    p_month: month,
    p_granted: granted,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  })
  return failure(error, 'Could not save the access.')
}

export type TeacherLibrary = { classroomId: number; teacherId: number; libraryId: number }

export async function fetchTeacherLibraries(): Promise<TeacherLibrary[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('classroom_teacher_libraries').select('classroom_id, teacher_id, library_id')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ classroomId: row.classroom_id, teacherId: row.teacher_id, libraryId: row.library_id }))
}

export async function setTeacherLibrary(classroomId: number, teacherId: number, libraryId: number | null) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_classroom_teacher_library', {
    p_classroom_id: classroomId,
    p_teacher_id: teacherId,
    p_library_id: libraryId,
  })
  return failure(error, 'Could not save.')
}

type UploadTicket = { endpoint: string; libraryId: string; videoId: string; expires: number; signature: string }

async function callClassVideos(body: Record<string, unknown>): Promise<{ error: string | null; data: Record<string, unknown> | null }> {
  if (!supabase) return { error: 'Supabase is not configured.', data: null }
  const { data, error } = await supabase.functions.invoke('class-videos', { body })
  if (error) {
    let reason = error.message || 'Could not reach the server.'
    try {
      const answer = await (error as { context?: Response }).context?.json()
      if (answer?.error) reason = answer.error
    } catch {
      // keep the general reason
    }
    return { error: reason, data: null }
  }
  return data?.ok ? { error: null, data } : { error: data?.error ?? 'Something went wrong.', data: null }
}

// Check: ask Bunny now. Cancel: an upload that never finished.
export async function classVideoAction(id: number, action: 'check' | 'cancel' | 'uploaded') {
  const { error, data } = await callClassVideos({ action, id })
  return { error, status: (data?.status as string | undefined) ?? null }
}

// tus wants each metadata value in base64 (of its UTF-8 bytes).
export function tusMetadata(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => {
      const bytes = new TextEncoder().encode(value)
      let binary = ''
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte)
      })
      return `${key} ${btoa(binary)}`
    })
    .join(',')
}

const CHUNK = 16 * 1024 * 1024

function sendChunk(url: string, offset: number, chunk: Blob, onSent: (loaded: number) => void) {
  return new Promise<number>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PATCH', url)
    request.setRequestHeader('Tus-Resumable', '1.0.0')
    request.setRequestHeader('Upload-Offset', String(offset))
    request.setRequestHeader('Content-Type', 'application/offset+octet-stream')
    request.upload.onprogress = (event) => onSent(event.loaded)
    request.onload = () => {
      const next = Number(request.getResponseHeader('Upload-Offset'))
      if (request.status >= 200 && request.status < 300 && Number.isFinite(next)) resolve(next)
      else reject(new Error(`Bunny said ${request.status}.`))
    }
    request.onerror = () => reject(new Error('The upload was cut off.'))
    request.send(chunk)
  })
}

async function currentOffset(url: string) {
  const response = await fetch(url, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' } })
  const offset = Number(response.headers.get('Upload-Offset'))
  if (!response.ok || !Number.isFinite(offset)) throw new Error('Bunny lost the upload.')
  return offset
}

// The browser sends the file straight to Bunny (tus, in pieces, picking up
// where it stopped after a cut). The server only gives a signed ticket.
async function sendFile(file: File, ticket: UploadTicket, title: string, onProgress: (fraction: number) => void) {
  const created = await fetch(ticket.endpoint, {
    method: 'POST',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(file.size),
      'Upload-Metadata': tusMetadata({ filetype: file.type || 'video/mp4', title }),
      AuthorizationSignature: ticket.signature,
      AuthorizationExpire: String(ticket.expires),
      VideoId: ticket.videoId,
      LibraryId: ticket.libraryId,
    },
  })
  const location = created.headers.get('Location')
  if (!created.ok || !location) throw new Error(`Bunny did not take the upload (${created.status}).`)
  const url = new URL(location, ticket.endpoint).toString()

  let offset = 0
  let tries = 0
  while (offset < file.size) {
    try {
      const start = offset
      offset = await sendChunk(url, start, file.slice(start, start + CHUNK), (loaded) => onProgress((start + loaded) / file.size))
      tries = 0
    } catch (problem) {
      tries += 1
      if (tries > 3) throw problem
      await new Promise((done) => setTimeout(done, 2000 * tries))
      offset = await currentOffset(url)
    }
  }
  onProgress(1)
}

// Makes the video, sends the file and tells the server it arrived.
export async function uploadClassVideo(
  classroomId: number,
  draft: VideoDraft,
  file: File,
  onProgress: (fraction: number) => void,
) {
  const started = await callClassVideos({
    action: 'start',
    classroomId,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    year: draft.year,
    month: draft.month,
    lessonDate: draft.lessonDate || null,
  })
  if (started.error || !started.data) return started.error ?? 'Could not start the upload.'
  const id = Number(started.data.id)
  try {
    await sendFile(file, started.data.upload as UploadTicket, draft.title.trim(), onProgress)
  } catch (problem) {
    await classVideoAction(id, 'cancel')
    return problem instanceof Error ? problem.message : 'The upload failed.'
  }
  const done = await classVideoAction(id, 'uploaded')
  return done.error
}
