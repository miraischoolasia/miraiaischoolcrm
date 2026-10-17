import { supabase } from './supabase'

// The child's class videos (portal_class_videos): for each class they are in,
// the videos they may watch, newest month first, and the months still closed.

export type ClassVideo = {
  id: number
  title: string
  description: string | null
  year: number
  month: number
  lesson_date: string | null
  embed_url: string
  // How far the child got (0-100), and whether they finished it.
  watched: number
  completed: boolean
}

export type ClassVideos = {
  classroom_id: number
  class: string
  videos: ClassVideo[]
  closed_months: { year: number; month: number }[]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1] ?? month} ${year}`
}

export async function fetchClassVideos(studentId: number): Promise<ClassVideos[]> {
  const { data, error } = await supabase.rpc('portal_class_videos', { p_student_id: studentId })
  if (error) throw new Error(error.message)
  return (data ?? []) as ClassVideos[]
}

// The server keeps the furthest point; opened counts a view (and a re-watch after finishing).
export async function saveVideoProgress(studentId: number, videoId: number, percentage: number, seconds: number, opened = false) {
  const { error } = await supabase.rpc('portal_save_video_progress', {
    p_student_id: studentId,
    p_video_id: videoId,
    p_percentage: Math.round(Math.min(100, Math.max(0, percentage)) * 100) / 100,
    p_seconds: Math.max(0, Math.round(seconds)),
    p_opened: opened,
  })
  return error ? error.message : null
}

// One class's videos by month, newest month first.
export function videosByMonth(videos: ClassVideo[]) {
  const months = new Map<string, { year: number; month: number; videos: ClassVideo[] }>()
  for (const video of videos) {
    const key = `${video.year}-${video.month}`
    const group = months.get(key) ?? { year: video.year, month: video.month, videos: [] }
    group.videos.push(video)
    months.set(key, group)
  }
  return [...months.values()].sort((a, b) => b.year - a.year || b.month - a.month)
}

// Bunny's player speaks player.js over postMessage: {context: 'player.js', event, value}.
export type PlayerEvent = { event: string; seconds?: number; duration?: number }

export function readPlayerMessage(data: unknown): PlayerEvent | null {
  let message = data
  if (typeof message === 'string') {
    try {
      message = JSON.parse(message)
    } catch {
      return null
    }
  }
  if (!message || typeof message !== 'object') return null
  const { context, event, value } = message as { context?: unknown; event?: unknown; value?: unknown }
  if (context !== 'player.js' || typeof event !== 'string') return null
  const numbers = (value && typeof value === 'object' ? value : {}) as { seconds?: unknown; duration?: unknown }
  return {
    event,
    seconds: typeof numbers.seconds === 'number' ? numbers.seconds : undefined,
    duration: typeof numbers.duration === 'number' ? numbers.duration : undefined,
  }
}

// Bunny's older player address reports how far the video got (player.js);
// the newer player.mediadelivery.net one sends nothing, so play on the older one.
export function playerUrl(embedUrl: string) {
  return embedUrl.replace('://player.mediadelivery.net/', '://iframe.mediadelivery.net/')
}

export function playerCommand(method: string, value?: string) {
  return JSON.stringify({ context: 'player.js', version: '0.0.11', method, value })
}
