import { supabase } from './supabase'

const BUCKET = 'lead-receipts'

export type LeadReceipt = {
  id: number
  leadId: number
  path: string
  name: string
  size: number
  addedBy: string | null
  createdAt: string
}

export type LeadZoomMeeting = {
  id: number
  leadId: number
  // ISO time; shown in the viewer's own time zone.
  startsAt: string
  link: string
  addedBy: string | null
  // scheduled = still to come (or happening), completed = it took place, cancelled = it will not happen.
  status: ZoomMeetingStatus
  // The calendar entry it sits on: a shared slot picked from the calendar, or one made for this parent alone.
  calendarItemId: number | null
}

export type ZoomMeetingStatus = 'scheduled' | 'completed' | 'cancelled'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

// Turns a database failure into something the team can act on.
export function enrolmentErrorMessage(error: unknown, fallback: string) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42P01' || code === 'PGRST205' || message?.includes('lead_receipts') || message?.includes('lead_zoom_meetings')) {
    return 'Receipts and Zoom meetings are not set up yet. Ask the admin to update the database.'
  }
  if (code === '42501') {
    return 'Your account is not allowed to change this.'
  }
  return message || fallback
}

export async function fetchLeadEnrolment(leadId: number): Promise<{ receipts: LeadReceipt[]; meetings: LeadZoomMeeting[] }> {
  const client = requireSupabase()
  const [receipts, meetings] = await Promise.all([
    client
      .from('lead_receipts')
      .select('id, lead_id, file_path, file_name, size_bytes, added_by, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false }),
    client
      .from('lead_zoom_meetings')
      .select('id, lead_id, starts_at, link, added_by, status, calendar_item_id')
      .eq('lead_id', leadId)
      .order('starts_at', { ascending: true }),
  ])
  if (receipts.error) {
    throw receipts.error
  }
  if (meetings.error) {
    throw meetings.error
  }
  return {
    receipts: (receipts.data ?? []).map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      path: row.file_path,
      name: row.file_name,
      size: row.size_bytes,
      addedBy: row.added_by,
      createdAt: row.created_at,
    })),
    meetings: (meetings.data ?? []).map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      startsAt: row.starts_at,
      link: row.link,
      addedBy: row.added_by,
      status: (row.status ?? 'scheduled') as ZoomMeetingStatus,
      calendarItemId: row.calendar_item_id ?? null,
    })),
  }
}

// Stores the PDF, then the row about it. If the row cannot be saved the file is taken back.
export async function addLeadReceipt(leadId: number, file: File, addedBy: string | null) {
  const client = requireSupabase()
  const path = `${leadId}/${crypto.randomUUID()}.pdf`
  const upload = await client.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf' })
  if (upload.error) {
    throw upload.error
  }
  const { error } = await client.from('lead_receipts').insert({
    lead_id: leadId,
    file_path: path,
    file_name: file.name,
    size_bytes: file.size,
    added_by: addedBy,
  })
  if (error) {
    await client.storage.from(BUCKET).remove([path]).catch(() => undefined)
    throw error
  }
}

export async function deleteLeadReceipt(receipt: LeadReceipt) {
  const client = requireSupabase()
  const { error } = await client.from('lead_receipts').delete().eq('id', receipt.id)
  if (error) {
    throw error
  }
  await client.storage.from(BUCKET).remove([receipt.path]).catch(() => undefined)
}

// A link that opens the receipt for a few minutes; the bucket itself is private.
export async function receiptLink(receipt: LeadReceipt) {
  const { data, error } = await requireSupabase().storage.from(BUCKET).createSignedUrl(receipt.path, 300)
  if (error || !data) {
    throw error ?? new Error('Could not open the receipt.')
  }
  return data.signedUrl
}

export async function addLeadZoomMeeting(
  leadId: number,
  startsAt: Date,
  link: string,
  addedBy: string | null,
  calendarItemId: number | null = null,
) {
  const { error } = await requireSupabase().from('lead_zoom_meetings').insert({
    lead_id: leadId,
    starts_at: startsAt.toISOString(),
    link: link.trim(),
    added_by: addedBy,
    calendar_item_id: calendarItemId,
  })
  if (error) {
    throw error
  }
}

// Changes a meeting: a new time/link/calendar entry (reschedule), or its status (complete, cancel).
export async function updateLeadZoomMeeting(
  id: number,
  patch: { startsAt?: Date; link?: string; status?: ZoomMeetingStatus; calendarItemId?: number | null },
) {
  const { error } = await requireSupabase()
    .from('lead_zoom_meetings')
    .update({
      ...(patch.startsAt ? { starts_at: patch.startsAt.toISOString() } : {}),
      ...(patch.link !== undefined ? { link: patch.link.trim() } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.calendarItemId !== undefined ? { calendar_item_id: patch.calendarItemId } : {}),
    })
    .eq('id', id)
  if (error) {
    throw error
  }
}

export async function deleteLeadZoomMeeting(id: number) {
  const { error } = await requireSupabase().from('lead_zoom_meetings').delete().eq('id', id)
  if (error) {
    throw error
  }
}
