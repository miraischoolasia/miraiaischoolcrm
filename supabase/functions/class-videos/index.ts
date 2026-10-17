// A teacher's own video for a class, straight to the class's Bunny Stream
// library (the teacher's own library for that class first).
//
//   {action: 'start', classroomId, title, description?, year, month, lessonDate?}
//     -> makes the video on Bunny and the class_videos row, and returns what the
//        browser needs to upload the file itself (a signature that lasts a few
//        hours; never the library key).
//   {action: 'uploaded' | 'check', id}  -> asks Bunny and saves the status.
//   {action: 'cancel', id}              -> an upload that never finished: removed
//                                          from Bunny and the list.
//
// The database decides who may (can_manage_class_videos).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { classLibrary } from '../zoom-lesson/bunny.ts'
import { CLASS_VIDEO_ROW, checkClassVideo, libraryKey, uploadSignature } from './videos.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

const UPLOAD_HOURS = 6

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ ok: false, error: 'Function is not configured.' }, 500)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'Please sign in.' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const mayManage = async (classroomId: number) =>
    (await caller.rpc('can_manage_class_videos', { p_classroom_id: classroomId })).data === true

  if (body.action === 'start') {
    const classroomId = Number(body.classroomId)
    const year = Number(body.year)
    const month = Number(body.month)
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
    const lessonDate = typeof body.lessonDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.lessonDate) ? body.lessonDate : null
    const validMonth = Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12
    if (!Number.isInteger(classroomId) || !title || title.length > 300 || !validMonth) {
      return json({ ok: false, error: 'Give the video a title, a year and a month.' }, 400)
    }
    if (!(await mayManage(classroomId))) return json({ ok: false, error: 'You cannot add videos to this class.' }, 403)
    const { data: me } = await caller.rpc('current_teacher_id')
    const teacherId = typeof me === 'number' ? me : null
    const library = await classLibrary(admin, classroomId, teacherId)
    if (!library) return json({ ok: false, error: 'This class has no Bunny library yet (Class Settings > Recordings).' }, 409)
    const libraryId = String(library.library_id)

    const made = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: 'POST',
      headers: { AccessKey: library.api_key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ title, collectionId: library.collection_id || undefined }),
      signal: AbortSignal.timeout(20000),
    }).catch(() => null)
    const video = made?.ok ? await made.json().catch(() => null) : null
    if (typeof video?.guid !== 'string') {
      return json({ ok: false, error: `Bunny did not make the video${made ? ` (${made.status})` : ''}.` }, 502)
    }

    const { data: row, error } = await admin
      .from('class_videos')
      .insert({
        classroom_id: classroomId,
        teacher_id: teacherId,
        created_by: teacherId,
        title,
        description,
        year,
        month,
        lesson_date: lessonDate,
        bunny_library_id: libraryId,
        bunny_video_id: video.guid,
        status: 'uploading',
        source: 'upload',
      })
      .select('id')
      .single()
    if (error || !row) return json({ ok: false, error: error?.message ?? 'Could not save the video.' }, 400)

    const expires = Math.floor(Date.now() / 1000) + UPLOAD_HOURS * 3600
    return json({
      ok: true,
      id: row.id,
      upload: {
        endpoint: 'https://video.bunnycdn.com/tusupload',
        libraryId,
        videoId: video.guid,
        expires,
        signature: await uploadSignature(libraryId, library.api_key, expires, video.guid),
      },
    })
  }

  const id = Number(body.id)
  if (!Number.isInteger(id) || !['uploaded', 'check', 'cancel'].includes(String(body.action))) {
    return json({ ok: false, error: 'Say what to do, and which video.' }, 400)
  }
  const { data: visible } = await caller.from('class_videos').select(`${CLASS_VIDEO_ROW}, classroom_id`).eq('id', id).maybeSingle()
  if (!visible || !(await mayManage(visible.classroom_id))) return json({ ok: false, error: 'Video not found.' }, 404)

  if (body.action === 'cancel') {
    if (visible.status !== 'uploading' && visible.status !== 'failed') {
      return json({ ok: false, error: 'Only an unfinished upload can be cancelled; hide the video instead.' }, 409)
    }
    const apiKey = await libraryKey(admin, visible.bunny_library_id)
    if (apiKey) {
      await fetch(`https://video.bunnycdn.com/library/${visible.bunny_library_id}/videos/${visible.bunny_video_id}`, {
        method: 'DELETE',
        headers: { AccessKey: apiKey },
        signal: AbortSignal.timeout(15000),
      }).catch(() => null)
    }
    await admin.from('class_videos').delete().eq('id', id)
    return json({ ok: true, status: 'cancelled' })
  }

  if (body.action === 'uploaded' && visible.status === 'uploading') {
    await admin.from('class_videos').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', id)
    visible.status = 'processing'
  }
  return json({ ok: true, status: await checkClassVideo(admin, visible) })
})
