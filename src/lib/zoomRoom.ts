import { supabase } from './supabase'

// Who is in the lesson's Zoom meeting right now, as Zoom tells zoom-webhook
// (20261023100000_zoom_room_watch.sql): children in the room, in the waiting
// room (the teacher Admits them in Zoom), gone, not come yet, and anyone who
// came in without a child's own link.

export type ZoomStay = {
  id: number
  studentId: number | null
  userName: string | null
  joinedAt: string
  leftAt: string | null
  dropped: boolean
  isHost: boolean
  strangerCleared: boolean
}

export type ZoomWaitingRow = {
  id: number
  studentId: number | null
  userName: string | null
  enteredAt: string
  leftAt: string | null
}

export type RoomRules = { lateMinutes: number; dropGraceSeconds: number }

export type RoomChild = { studentId: number; name: string; firstJoinedAt: string | null; late: boolean; lastLeftAt: string | null; dropped: boolean }

export type Room = {
  here: RoomChild[]
  waiting: { key: string; studentId: number | null; name: string; enteredAt: string }[]
  left: RoomChild[]
  notYet: RoomChild[]
  strangers: { id: number; name: string; joinedAt: string; stillHere: boolean }[]
  hostHere: boolean
}

export function buildRoom(input: {
  roster: { studentId: number; name: string }[]
  stays: ZoomStay[]
  waiting: ZoomWaitingRow[]
  startsAt: string | null
  rules: RoomRules
}): Room {
  const { roster, stays, waiting, startsAt, rules } = input
  const start = startsAt ? Date.parse(startsAt) : NaN
  const names = new Map(roster.map((child) => [child.studentId, child.name]))
  const byChild = new Map<number, ZoomStay[]>()
  for (const stay of stays) {
    if (stay.studentId === null || stay.isHost) continue
    byChild.set(stay.studentId, [...(byChild.get(stay.studentId) ?? []), stay])
  }

  const here: RoomChild[] = []
  const left: RoomChild[] = []
  const notYet: RoomChild[] = []
  const childIds = new Set([...roster.map((child) => child.studentId), ...byChild.keys()])
  for (const studentId of childIds) {
    const own = (byChild.get(studentId) ?? []).slice().sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    const name = names.get(studentId) ?? own.find((stay) => stay.userName)?.userName ?? `Student ${studentId}`
    if (own.length === 0) {
      notYet.push({ studentId, name, firstJoinedAt: null, late: false, lastLeftAt: null, dropped: false })
      continue
    }
    const firstJoinedAt = own[0].joinedAt
    const late = Number.isFinite(start) && Date.parse(firstJoinedAt) > start + rules.lateMinutes * 60_000
    const last = own[own.length - 1]
    const child: RoomChild = { studentId, name, firstJoinedAt, late, lastLeftAt: last.leftAt, dropped: last.dropped }
    if (own.some((stay) => stay.leftAt === null)) here.push({ ...child, lastLeftAt: null, dropped: false })
    else left.push(child)
  }

  const inside = new Set(here.map((child) => child.studentId))
  const waitingNow = waiting
    .filter((row) => row.leftAt === null && !(row.studentId !== null && inside.has(row.studentId)))
    .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
    .map((row) => ({
      key: `w${row.id}`,
      studentId: row.studentId,
      name: (row.studentId !== null ? names.get(row.studentId) : null) ?? row.userName ?? 'Someone',
      enteredAt: row.enteredAt,
    }))
  const waitingChildren = new Set(waiting.filter((row) => row.leftAt === null && row.studentId !== null).map((row) => row.studentId))

  const strangers = stays
    .filter((stay) => stay.studentId === null && !stay.isHost && !stay.strangerCleared)
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
    .map((stay) => ({ id: stay.id, name: stay.userName ?? 'Someone', joinedAt: stay.joinedAt, stillHere: stay.leftAt === null }))

  const byName = (a: RoomChild, b: RoomChild) => a.name.localeCompare(b.name)
  return {
    here: here.sort(byName),
    waiting: waitingNow,
    left: left.sort(byName),
    notYet: notYet.filter((child) => !waitingChildren.has(child.studentId)).sort(byName),
    strangers,
    hostHere: stays.some((stay) => stay.isHost && stay.leftAt === null),
  }
}

export function readRoomRules(value: unknown): RoomRules {
  const rules = (value ?? {}) as { late_minutes?: unknown; drop_grace_seconds?: unknown }
  const late = Number(rules.late_minutes ?? 5)
  const grace = Number(rules.drop_grace_seconds ?? 0)
  return {
    lateMinutes: Number.isFinite(late) && late >= 0 ? late : 5,
    dropGraceSeconds: Number.isFinite(grace) && grace >= 0 ? grace : 0,
  }
}

export type RoomData = {
  roster: { studentId: number; name: string }[]
  stays: ZoomStay[]
  waiting: ZoomWaitingRow[]
  startsAt: string | null
  rules: RoomRules
}

export async function fetchRoom(sessionId: number): Promise<RoomData> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [roster, stays, waiting, session, settings] = await Promise.all([
    supabase.rpc('class_session_roster', { p_session_id: sessionId }),
    supabase
      .from('zoom_participation')
      .select('id, student_id, user_name, joined_at, left_at, dropped, is_host, stranger_cleared_at')
      .eq('session_id', sessionId)
      .order('joined_at')
      .limit(2000),
    supabase.from('zoom_waiting').select('id, student_id, user_name, entered_at, left_at').eq('session_id', sessionId).limit(2000),
    supabase.from('class_sessions').select('starts_at').eq('id', sessionId).maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'zoom_attendance').maybeSingle(),
  ])
  const failed = roster.error ?? stays.error ?? waiting.error
  if (failed) throw new Error(failed.message || 'Could not read who is in the lesson.')
  return {
    roster: (roster.data ?? []).map((row) => ({ studentId: row.student_id, name: row.full_name ?? `Student ${row.student_id}` })),
    stays: (stays.data ?? []).map((row) => ({
      id: row.id,
      studentId: row.student_id,
      userName: row.user_name,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      dropped: row.dropped,
      isHost: row.is_host,
      strangerCleared: row.stranger_cleared_at !== null,
    })),
    waiting: (waiting.data ?? []).map((row) => ({
      id: row.id,
      studentId: row.student_id,
      userName: row.user_name,
      enteredAt: row.entered_at,
      leftAt: row.left_at,
    })),
    startsAt: session.data?.starts_at ?? null,
    rules: readRoomRules(settings.data?.value),
  }
}

export async function clearStranger(participationId: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('clear_zoom_stranger', { p_participation_id: participationId })
  return error ? error.message || 'Could not clear it.' : null
}

export function watchRoom(sessionId: number, onChange: () => void) {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client
    .channel(`zoom-room-${sessionId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'zoom_participation', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'zoom_waiting', filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
