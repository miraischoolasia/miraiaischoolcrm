import { supabase } from './supabase'

// Lesson recordings on Bunny Stream (20261022090000_recordings_bunny.sql and the
// recording-bunny function): the school's libraries, which class goes where,
// and each recording's state.

export type RecordingLibrary = {
  id: number
  name: string
  libraryId: string
  collectionId: string | null
  hasKey: boolean
  classes: number
}

export type LessonRecording = {
  id: number
  startedAt: string | null
  durationMinutes: number | null
  bunnyStatus: 'sending' | 'sent' | 'ready' | 'failed' | 'no_library' | null
  bunnyDetail: string | null
  bunnyUrl: string | null
  zoomDeleted: boolean
}

export const recordingStatusLabels: Record<NonNullable<LessonRecording['bunnyStatus']> | 'none', string> = {
  none: 'On Zoom',
  sending: 'Sending to Bunny',
  sent: 'Bunny is processing',
  ready: 'On Bunny',
  failed: 'Not sent',
  no_library: 'No Bunny library for this class',
}

function message(error: { message?: string } | null, fallback: string) {
  return error ? error.message || fallback : null
}

export async function fetchRecordingLibraries(): Promise<RecordingLibrary[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('recording_libraries_list')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    libraryId: row.library_id,
    collectionId: row.collection_id,
    hasKey: row.has_key,
    classes: Number(row.classes),
  }))
}

// apiKey '' on a change keeps the saved key.
export async function saveRecordingLibrary(input: { id: number | null; name: string; libraryId: string; apiKey: string; collectionId: string }) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_recording_library', {
    p_id: input.id,
    p_name: input.name.trim(),
    p_library_id: input.libraryId.trim(),
    p_api_key: input.apiKey.trim(),
    p_collection_id: input.collectionId.trim() || null,
  })
  return message(error, 'Could not save the library.')
}

export async function deleteRecordingLibrary(id: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('delete_recording_library', { p_id: id })
  return message(error, 'Could not delete the library.')
}

export async function setClassroomRecordingLibrary(classroomId: number, libraryId: number | null) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_classroom_recording_library', { p_classroom_id: classroomId, p_library_id: libraryId })
  return message(error, 'Could not save.')
}

export async function fetchDeleteZoomAfterUpload(): Promise<boolean> {
  if (!supabase) return true
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'zoom_recordings').maybeSingle()
  return (data?.value as { delete_zoom_after_upload?: unknown } | null)?.delete_zoom_after_upload !== false
}

export async function saveDeleteZoomAfterUpload(value: boolean) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_recording_settings', { p_delete_zoom_after_upload: value })
  return message(error, 'Could not save.')
}

export async function fetchLessonRecordings(sessionId: number): Promise<LessonRecording[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('class_session_recordings')
    .select('id, started_at, duration_minutes, bunny_status, bunny_detail, bunny_library_id, bunny_video_id, zoom_deleted_at')
    .eq('session_id', sessionId)
    .order('started_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    durationMinutes: row.duration_minutes,
    bunnyStatus: row.bunny_status,
    bunnyDetail: row.bunny_detail,
    bunnyUrl:
      row.bunny_status === 'ready' && row.bunny_library_id && row.bunny_video_id
        ? `https://iframe.mediadelivery.net/embed/${row.bunny_library_id}/${row.bunny_video_id}`
        : null,
    zoomDeleted: Boolean(row.zoom_deleted_at),
  }))
}

// Check: ask Bunny now. Send: send it to Bunny again (fresh links from Zoom).
export async function recordingAction(recordingId: number, action: 'check' | 'send') {
  if (!supabase) return 'Supabase is not configured.'
  const { data, error } = await supabase.functions.invoke('recording-bunny', { body: { action, recordingId } })
  if (error) {
    let reason = error.message || 'Could not reach the server.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) reason = body.error
    } catch {
      // keep the general reason
    }
    return reason
  }
  return data?.ok ? null : (data?.error ?? 'Something went wrong.')
}

// The address Bunny calls when a video is processed (each library's webhook URL).
export function bunnyWebhookUrl() {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  return base ? `${base}/functions/v1/recording-bunny` : null
}
