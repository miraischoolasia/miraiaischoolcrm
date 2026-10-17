// Facebook Live of a lesson: Zoom streams the meeting to the school's Facebook
// Page (Zoom's Custom Live Streaming must be on for the account).
//
// The teacher switches it on for the lesson (fb_live_wanted). The Facebook
// live video is only made while the meeting is running, so no empty live
// video is left on the Page: at once when Zoom is already on, otherwise when
// Zoom says the meeting started (zoom-webhook). It stops when the teacher
// switches it off or the meeting ends.
//
// Secrets (each school's own Page, never in a table):
//   FB_PAGE_ID, FB_PAGE_TOKEN   a long-lived Page access token
//   FB_GRAPH_VERSION            optional, default v25.0
import { splitStreamUrl } from './logic.ts'
import { zoomApi } from './zoomApi.ts'

// deno-lint-ignore no-explicit-any
type Admin = any

export function facebookConfigured() {
  return !!(Deno.env.get('FB_PAGE_ID') && Deno.env.get('FB_PAGE_TOKEN'))
}

async function graph<T>(method: 'GET' | 'POST', path: string, params: Record<string, string> = {}): Promise<T> {
  const version = Deno.env.get('FB_GRAPH_VERSION') || 'v25.0'
  const token = Deno.env.get('FB_PAGE_TOKEN') ?? ''
  const query = new URLSearchParams({ ...params, access_token: token })
  const url = `https://graph.facebook.com/${version}${path}`
  const response =
    method === 'GET'
      ? await fetch(`${url}?${query}`, { signal: AbortSignal.timeout(15000) })
      : await fetch(url, { method, body: query, signal: AbortSignal.timeout(15000) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) {
    const message = String(data?.error?.message ?? response.status).split(token).join('***')
    throw new Error(`Facebook: ${message}`)
  }
  return data as T
}

type ZoomRow = { session_id: number; meeting_id: string; topic: string | null; fb_live_id: string | null }

// Goes live now. On any failure the Facebook video is ended again and the
// reason saved for the teacher.
export async function goLiveOnFacebook(admin: Admin, token: string, zoom: ZoomRow) {
  if (zoom.fb_live_id) return
  const pageId = Deno.env.get('FB_PAGE_ID') ?? ''
  const title = (zoom.topic ?? 'Live class').slice(0, 250)
  let liveId: string | null = null
  try {
    const live = await graph<{ id: string; secure_stream_url: string }>('POST', `/${pageId}/live_videos`, { status: 'LIVE_NOW', title })
    liveId = live.id
    const stream = splitStreamUrl(live.secure_stream_url ?? '')
    if (!stream) throw new Error('Facebook gave no stream address.')
    const info = await graph<{ permalink_url?: string }>('GET', `/${live.id}`, { fields: 'permalink_url' }).catch(() => ({} as { permalink_url?: string }))
    const pageUrl = info.permalink_url ? `https://www.facebook.com${info.permalink_url}` : `https://www.facebook.com/${pageId}/live`
    const meeting = encodeURIComponent(zoom.meeting_id)
    await zoomApi(token, `/meetings/${meeting}/livestream`, {
      method: 'PATCH',
      body: { stream_url: stream.streamUrl, stream_key: stream.streamKey, page_url: pageUrl },
    })
    await zoomApi(token, `/meetings/${meeting}/livestream/status`, {
      method: 'PATCH',
      body: { action: 'start', settings: { active_speaker_name: false, display_name: title.slice(0, 50) } },
    })
    await admin
      .from('class_session_zoom')
      .update({ fb_live_id: live.id, fb_live_url: pageUrl, fb_live_error: null, fb_live_started_at: new Date().toISOString() })
      .eq('session_id', zoom.session_id)
  } catch (problem) {
    if (liveId) await graph('POST', `/${liveId}`, { end_live_video: 'true' }).catch(() => null)
    const reason = problem instanceof Error ? problem.message.slice(0, 300) : 'Could not go live.'
    await admin.from('class_session_zoom').update({ fb_live_error: reason }).eq('session_id', zoom.session_id)
    throw problem
  }
}

export async function stopFacebookLive(admin: Admin, token: string | null, zoom: ZoomRow) {
  if (!zoom.fb_live_id) return
  if (token) {
    await zoomApi(token, `/meetings/${encodeURIComponent(zoom.meeting_id)}/livestream/status`, {
      method: 'PATCH',
      body: { action: 'stop' },
    }).catch((problem) => console.error('zoom livestream stop', problem instanceof Error ? problem.message : problem))
  }
  await graph('POST', `/${zoom.fb_live_id}`, { end_live_video: 'true' }).catch((problem) =>
    console.error('facebook end', problem instanceof Error ? problem.message : problem),
  )
  await admin.from('class_session_zoom').update({ fb_live_id: null }).eq('session_id', zoom.session_id)
}
