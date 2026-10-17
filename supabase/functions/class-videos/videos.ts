// Class videos on Bunny Stream: the upload signature and asking Bunny whether
// a video is finished. The library key never leaves the server.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { bunnyState } from '../zoom-lesson/recordings.ts'

export type ClassVideoRow = {
  id: number
  bunny_library_id: string
  bunny_video_id: string
  status: string
}

export const CLASS_VIDEO_ROW = 'id, bunny_library_id, bunny_video_id, status'

// Bunny's resumable (TUS) upload signature: sha256(library + key + expiry + video).
export async function uploadSignature(libraryId: string, apiKey: string, expires: number, videoId: string) {
  const bytes = new TextEncoder().encode(`${libraryId}${apiKey}${expires}${videoId}`)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function libraryKey(admin: SupabaseClient, libraryId: string) {
  const { data } = await admin.from('recording_libraries').select('api_key').eq('library_id', libraryId).limit(1).maybeSingle()
  return data?.api_key ?? null
}

// Asks Bunny about the video and saves ready / failed; returns the status.
export async function checkClassVideo(admin: SupabaseClient, row: ClassVideoRow) {
  try {
    const apiKey = await libraryKey(admin, row.bunny_library_id)
    if (!apiKey) return row.status
    const response = await fetch(`https://video.bunnycdn.com/library/${row.bunny_library_id}/videos/${row.bunny_video_id}`, {
      headers: { AccessKey: apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return row.status
    const video = await response.json()
    const state = bunnyState(video?.status)
    // Bunny has no file yet: an upload that has not arrived stays "uploading".
    const status = state === 'processing' && row.status === 'uploading' && !video?.storageSize ? 'uploading' : state
    if (status !== row.status) {
      await admin.from('class_videos').update({ status, updated_at: new Date().toISOString() }).eq('id', row.id)
    }
    return status
  } catch {
    return row.status
  }
}
