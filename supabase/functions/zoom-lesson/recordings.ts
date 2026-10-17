// The parts of sending a Zoom recording to Bunny Stream that need no network,
// so they can be tested.

export type RecordingFile = {
  id?: string
  file_type?: string
  file_extension?: string
  recording_type?: string
  status?: string
  file_size?: number
  download_url?: string
}

// The picture a student wants to replay: the shared screen with the teacher
// beside it, then the speaker view.
const PREFERRED = ['shared_screen_with_speaker_view', 'shared_screen_with_gallery_view', 'active_speaker', 'gallery_view']

// The one video file to send (Zoom also lists audio, chat, transcripts and other MP4 views).
export function pickRecordingFile(files: RecordingFile[] | undefined): RecordingFile | null {
  const videos = (files ?? []).filter(
    (file) =>
      file.download_url &&
      (file.file_type === 'MP4' || file.file_extension === 'MP4') &&
      (!file.status || file.status === 'completed'),
  )
  if (videos.length === 0) return null
  for (const type of PREFERRED) {
    const hit = videos.find((file) => file.recording_type === type)
    if (hit) return hit
  }
  return videos.reduce((best, file) => ((file.file_size ?? 0) > (best.file_size ?? 0) ? file : best))
}

// What Zoom's recording.completed message holds for us: the files and the
// short-lived token to download them.
export function readRecordingFiles(message: { payload?: unknown; download_token?: unknown }) {
  const object = (message.payload as { object?: { recording_files?: unknown } } | undefined)?.object
  return {
    files: Array.isArray(object?.recording_files) ? (object.recording_files as RecordingFile[]) : [],
    downloadToken: typeof message.download_token === 'string' ? message.download_token : null,
  }
}

// The video's name in Bunny; it ends with the lesson so it can be found again.
export function recordingTitle(className: string | null, lessonDate: string, sessionId: number) {
  return `${(className ?? 'Class').slice(0, 120)} · ${lessonDate} · lesson ${sessionId}`
}

// Bunny's video status: 4 is finished; 5 and 6 failed; everything else is on its way.
export function bunnyState(status: unknown): 'ready' | 'failed' | 'processing' {
  if (status === 4) return 'ready'
  if (status === 5 || status === 6) return 'failed'
  return 'processing'
}

// Zoom wants a meeting UUID that starts with "/" or holds "//" encoded twice.
export function zoomRecordingsPath(meetingUuid: string) {
  const once = encodeURIComponent(meetingUuid)
  const id = meetingUuid.startsWith('/') || meetingUuid.includes('//') ? encodeURIComponent(once) : once
  return `/meetings/${id}/recordings`
}

export function bunnyEmbedUrl(libraryId: string, videoId: string) {
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`
}
