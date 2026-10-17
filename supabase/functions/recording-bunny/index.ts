// Lesson recordings on Bunny Stream: Bunny's notice that a video is processed,
// and a teacher's Check / Send again from the class console.
//
//   Bunny (no login; set as the library's webhook URL): {VideoLibraryId, VideoGuid, Status}
//     -> we ask Bunny ourselves; only Bunny's own answer counts, so a fake
//        notice can do nothing.
//   Staff (signed in): {action: 'check' | 'send', recordingId}
//
// When Bunny says the video is finished it is marked ready and, when the school
// wants it (Class Settings > Recordings), deleted from Zoom.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { checkBunny, resendToBunny } from '../zoom-lesson/bunny.ts'
import { CLASS_VIDEO_ROW, checkClassVideo } from '../class-videos/videos.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
}

const ROW = 'id, session_id, zoom_recording_uuid, bunny_library_id, bunny_video_id, bunny_status, zoom_deleted_at'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ ok: false, error: 'Function is not configured.' }, 500)

  let body: { VideoGuid?: unknown; action?: unknown; recordingId?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Bunny's notice.
  if (typeof body.VideoGuid === 'string' && body.VideoGuid) {
    const { data: row } = await admin.from('class_session_recordings').select(ROW).eq('bunny_video_id', body.VideoGuid).maybeSingle()
    if (row) return json({ ok: true, status: await checkBunny(admin, row) })
    // A teacher's own upload to a class.
    const { data: video } = await admin.from('class_videos').select(CLASS_VIDEO_ROW).eq('bunny_video_id', body.VideoGuid).limit(1).maybeSingle()
    if (!video) return json({ ok: true, ignored: true })
    return json({ ok: true, status: await checkClassVideo(admin, video) })
  }

  // A teacher's Check / Send again: the database decides who may.
  const authHeader = req.headers.get('Authorization')
  const recordingId = Number(body.recordingId)
  const action = body.action === 'send' ? 'send' : body.action === 'check' ? 'check' : null
  if (!authHeader || !action || !Number.isInteger(recordingId)) return json({ ok: false, error: 'Say what to do, and which recording.' }, 400)
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: visible } = await caller.from('class_session_recordings').select(ROW).eq('id', recordingId).maybeSingle()
  if (!visible) return json({ ok: false, error: 'Recording not found.' }, 404)
  const { data: mayRun } = await caller.rpc('can_run_class_session', { p_session_id: visible.session_id })
  if (mayRun !== true) return json({ ok: false, error: 'Only this class\'s teacher can do this.' }, 403)

  const status = action === 'send' ? await resendToBunny(admin, visible) : await checkBunny(admin, visible)
  const { data: after } = await admin.from('class_session_recordings').select('bunny_status, bunny_detail, zoom_deleted_at').eq('id', recordingId).maybeSingle()
  return json({ ok: true, status, recording: after })
})
