// Sending a lesson's Zoom recording to the Bunny Stream library of its class,
// checking Bunny has it, and then deleting Zoom's copy. Used by zoom-webhook
// (when Zoom finishes a recording) and recording-bunny (Bunny's notice, or a
// teacher's Check / Send again). Never throws: the outcome is saved on the
// recording row (class_session_recordings) for the class console.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { bunnyState, pickRecordingFile, recordingTitle, zoomRecordingsPath, type RecordingFile } from './recordings.ts'
import { zoomApi, zoomToken } from './zoomApi.ts'

type Row = {
  id: number
  session_id: number
  zoom_recording_uuid: string
  bunny_library_id: string | null
  bunny_video_id: string | null
  bunny_status: string | null
  zoom_deleted_at: string | null
}

async function save(admin: SupabaseClient, id: number, patch: Record<string, unknown>) {
  await admin
    .from('class_session_recordings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
}

function zoomSecrets() {
  const accountId = Deno.env.get('ZOOM_ACCOUNT_ID')
  const clientId = Deno.env.get('ZOOM_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
  return accountId && clientId && clientSecret ? { accountId, clientId, clientSecret } : null
}

// The Bunny library for a class: the teacher's own one for that class, else
// the class's. With its key (server only).
export async function classLibrary(admin: SupabaseClient, classroomId: number | null, teacherId: number | null) {
  if (!classroomId) return null
  let libraryRowId: number | null = null
  if (teacherId) {
    const { data: own } = await admin
      .from('classroom_teacher_libraries')
      .select('library_id')
      .eq('classroom_id', classroomId)
      .eq('teacher_id', teacherId)
      .maybeSingle()
    libraryRowId = own?.library_id ?? null
  }
  if (!libraryRowId) {
    const { data: classroom } = await admin.from('classrooms').select('recording_library_id').eq('id', classroomId).maybeSingle()
    libraryRowId = classroom?.recording_library_id ?? null
  }
  if (!libraryRowId) return null
  const { data } = await admin.from('recording_libraries').select('library_id, api_key, collection_id').eq('id', libraryRowId).maybeSingle()
  return data
}

// The lesson's class and its library.
async function libraryFor(admin: SupabaseClient, sessionId: number) {
  const { data: session } = await admin
    .from('class_sessions')
    .select('lesson_date, classroom_id, schedule_id, teacher_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return { session: null, className: null, library: null }
  const [{ data: classroom }, { data: schedule }] = await Promise.all([
    session.classroom_id
      ? admin.from('classrooms').select('name').eq('id', session.classroom_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('schedules').select('title').eq('id', session.schedule_id).maybeSingle(),
  ])
  const library = await classLibrary(admin, session.classroom_id, session.teacher_id)
  return { session, className: classroom?.name ?? schedule?.title ?? null, library }
}

// A Zoom recording that is ready on Bunny also becomes one of the class's videos.
async function addClassVideo(admin: SupabaseClient, row: Row) {
  const { data: session } = await admin
    .from('class_sessions')
    .select('lesson_date, classroom_id, teacher_id, schedule_id')
    .eq('id', row.session_id)
    .maybeSingle()
  if (!session?.classroom_id || !row.bunny_library_id || !row.bunny_video_id) return
  const [{ data: classroom }, { data: schedule }] = await Promise.all([
    admin.from('classrooms').select('name').eq('id', session.classroom_id).maybeSingle(),
    admin.from('schedules').select('title').eq('id', session.schedule_id).maybeSingle(),
  ])
  const [year, month] = String(session.lesson_date).split('-').map(Number)
  await admin.from('class_videos').upsert(
    {
      classroom_id: session.classroom_id,
      teacher_id: session.teacher_id,
      title: `${schedule?.title ?? classroom?.name ?? 'Lesson'} · ${session.lesson_date}`.slice(0, 300),
      year,
      month,
      lesson_date: session.lesson_date,
      bunny_library_id: row.bunny_library_id,
      bunny_video_id: row.bunny_video_id,
      status: 'ready',
      source: 'zoom',
      recording_id: row.id,
    },
    { onConflict: 'bunny_library_id,bunny_video_id', ignoreDuplicates: true },
  )
}

// Asks Bunny to fetch the video from Zoom. zoomAuth: Zoom's download token, or an API token.
export async function sendToBunny(admin: SupabaseClient, row: Row, files: RecordingFile[], zoomAuth: string | null) {
  try {
    const { session, className, library } = await libraryFor(admin, row.session_id)
    if (!session || !library) {
      await save(admin, row.id, { bunny_status: 'no_library', bunny_detail: 'This class has no Bunny library (Class Settings > Recordings).' })
      return 'no_library'
    }
    const file = pickRecordingFile(files)
    if (!file?.download_url) {
      await save(admin, row.id, { bunny_status: 'failed', bunny_detail: 'Zoom listed no video file for this recording.' })
      return 'failed'
    }
    await save(admin, row.id, { bunny_status: 'sending', bunny_library_id: library.library_id, bunny_detail: null })

    const title = recordingTitle(className, session.lesson_date, row.session_id)
    const query = library.collection_id ? `?collectionId=${encodeURIComponent(library.collection_id)}` : ''
    const response = await fetch(`https://video.bunnycdn.com/library/${library.library_id}/videos/fetch${query}`, {
      method: 'POST',
      headers: { AccessKey: library.api_key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: file.download_url, title, headers: zoomAuth ? { Authorization: `Bearer ${zoomAuth}` } : undefined }),
      signal: AbortSignal.timeout(20000),
    })
    const text = await response.text()
    if (!response.ok) {
      await save(admin, row.id, { bunny_status: 'failed', bunny_detail: `Bunny said ${response.status}. ${text}`.slice(0, 500) })
      return 'failed'
    }

    // Bunny may answer with the new video's id; if not, find it by its title.
    let videoId: string | null = null
    try {
      const data = JSON.parse(text)
      videoId = typeof data?.id === 'string' ? data.id : typeof data?.guid === 'string' ? data.guid : null
    } catch {
      // keep looking below
    }
    if (!videoId) {
      const found = await fetch(
        `https://video.bunnycdn.com/library/${library.library_id}/videos?search=${encodeURIComponent(title)}&itemsPerPage=5&orderBy=date`,
        { headers: { AccessKey: library.api_key, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
      )
      const list = found.ok ? await found.json() : null
      videoId = list?.items?.find((item: { title?: string; guid?: string }) => item.title === title)?.guid ?? null
    }
    await save(admin, row.id, { bunny_status: 'sent', bunny_video_id: videoId })
    return 'sent'
  } catch (problem) {
    await save(admin, row.id, { bunny_status: 'failed', bunny_detail: (problem instanceof Error ? problem.message : 'Could not reach Bunny.').slice(0, 500) })
    return 'failed'
  }
}

// Sends again with fresh download links from Zoom (Zoom's download token only lasts a day).
export async function resendToBunny(admin: SupabaseClient, row: Row) {
  const secrets = zoomSecrets()
  if (!secrets) return 'failed'
  if (row.zoom_deleted_at) {
    await save(admin, row.id, { bunny_detail: 'Zoom no longer has this recording.' })
    return 'failed'
  }
  try {
    const token = await zoomToken(secrets.accountId, secrets.clientId, secrets.clientSecret)
    const data = await zoomApi(token, zoomRecordingsPath(row.zoom_recording_uuid))
    return sendToBunny(admin, row, (data?.recording_files ?? []) as RecordingFile[], token)
  } catch (problem) {
    await save(admin, row.id, { bunny_status: 'failed', bunny_detail: (problem instanceof Error ? problem.message : 'Zoom did not answer.').slice(0, 500) })
    return 'failed'
  }
}

// Asks Bunny about the video; once it is finished, marks it ready and (when the
// school wants it) deletes Zoom's copy.
export async function checkBunny(admin: SupabaseClient, row: Row) {
  try {
    if (!row.bunny_library_id || !row.bunny_video_id) return row.bunny_status ?? 'none'
    const { data: library } = await admin
      .from('recording_libraries')
      .select('api_key')
      .eq('library_id', row.bunny_library_id)
      .limit(1)
      .maybeSingle()
    if (!library) return row.bunny_status ?? 'none'
    const response = await fetch(`https://video.bunnycdn.com/library/${row.bunny_library_id}/videos/${row.bunny_video_id}`, {
      headers: { AccessKey: library.api_key, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return row.bunny_status ?? 'none'
    const video = await response.json()
    const state = bunnyState(video?.status)
    if (state === 'failed') {
      await save(admin, row.id, { bunny_status: 'failed', bunny_detail: 'Bunny could not process the video.' })
      return 'failed'
    }
    if (state !== 'ready') return 'sent'
    await save(admin, row.id, { bunny_status: 'ready', bunny_detail: null })
    await addClassVideo(admin, { ...row, bunny_status: 'ready' })

    const { data: settings } = await admin.from('app_settings').select('value').eq('key', 'zoom_recordings').maybeSingle()
    const deleteZoom = (settings?.value as { delete_zoom_after_upload?: unknown } | null)?.delete_zoom_after_upload !== false
    const secrets = zoomSecrets()
    if (deleteZoom && !row.zoom_deleted_at && secrets) {
      try {
        const token = await zoomToken(secrets.accountId, secrets.clientId, secrets.clientSecret)
        await zoomApi(token, `${zoomRecordingsPath(row.zoom_recording_uuid)}?action=delete`, { method: 'DELETE' })
        await save(admin, row.id, { zoom_deleted_at: new Date().toISOString() })
      } catch (problem) {
        await save(admin, row.id, {
          bunny_detail: `Ready on Bunny; Zoom's copy was not deleted: ${problem instanceof Error ? problem.message : 'Zoom did not answer.'}`.slice(0, 500),
        })
      }
    }
    return 'ready'
  } catch {
    return row.bunny_status ?? 'none'
  }
}
