import { supabase } from './supabase'
import type { VideoAccess } from './classVideos'
import type { Classroom } from '../types/domain'

// Recording access by age group x subject x month, apart from classes
// (20261027500000_video_grants.sql). A class with no subject is opened as itself.
export type GrantTopic = { kind: 'topic'; ageGroup: string; subjectId: number } | { kind: 'class'; classroomId: number }

export type VideoGrant = VideoAccess & {
  id: number
  topic: GrantTopic
}

type GrantRow = {
  id: number
  student_id: number
  age_group: string | null
  subject_id: number | null
  classroom_id: number | null
  year: number
  month: number
  starts_on: string | null
  ends_on: string | null
}

const COLUMNS = 'id, student_id, age_group, subject_id, classroom_id, year, month, starts_on, ends_on'

export function topicOfClassroom(classroom: Pick<Classroom, 'id' | 'ageGroup' | 'subjectId'>): GrantTopic {
  return classroom.subjectId
    ? { kind: 'topic', ageGroup: classroom.ageGroup, subjectId: classroom.subjectId }
    : { kind: 'class', classroomId: classroom.id }
}

export function topicKey(topic: GrantTopic) {
  return topic.kind === 'topic' ? `t:${topic.ageGroup}:${topic.subjectId}` : `c:${topic.classroomId}`
}

function topicOfRow(row: GrantRow): GrantTopic {
  return row.classroom_id !== null
    ? { kind: 'class', classroomId: row.classroom_id }
    : { kind: 'topic', ageGroup: row.age_group ?? '', subjectId: row.subject_id ?? 0 }
}

function mapRow(row: GrantRow): VideoGrant {
  return {
    id: row.id,
    studentId: row.student_id,
    year: row.year,
    month: row.month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    topic: topicOfRow(row),
  }
}

// Open today: started (or no start) and not ended. A grant closed by a stop keeps its row with an end day.
export function isGrantOpen(grant: Pick<VideoAccess, 'startsOn' | 'endsOn'>, today: string) {
  return (grant.startsOn === null || grant.startsOn <= today) && (grant.endsOn === null || today <= grant.endsOn)
}

export async function fetchStudentGrants(studentId: number): Promise<VideoGrant[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('student_video_grants').select(COLUMNS).eq('student_id', studentId)
  if (error) throw new Error(error.message)
  return ((data ?? []) as GrantRow[]).map(mapRow)
}

// Every student's months of one topic (the class page's "who can watch").
export async function fetchTopicGrants(topic: GrantTopic): Promise<VideoAccess[]> {
  if (!supabase) return []
  const rows: GrantRow[] = []
  for (let from = 0; ; from += 1000) {
    const base = supabase.from('student_video_grants').select(COLUMNS)
    const query =
      topic.kind === 'topic'
        ? base.is('classroom_id', null).eq('age_group', topic.ageGroup).eq('subject_id', topic.subjectId)
        : base.eq('classroom_id', topic.classroomId)
    const { data, error } = await query.order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as GrantRow[]))
    if ((data ?? []).length < 1000) break
  }
  return rows.map(mapRow)
}

export async function fetchCanGrantVideos() {
  if (!supabase) return false
  const { data } = await supabase.rpc('can_grant_videos')
  return data === true
}

// Opens or closes months of one topic for one or many students. Resolves to an error message, or null.
export async function setVideoGrants({
  studentIds,
  topic,
  months,
  granted,
  startsOn = null,
  endsOn = null,
}: {
  studentIds: number[]
  topic: GrantTopic
  months: { year: number; month: number }[]
  granted: boolean
  startsOn?: string | null
  endsOn?: string | null
}) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_student_video_grants', {
    p_student_ids: studentIds,
    p_age_group: topic.kind === 'topic' ? topic.ageGroup : null,
    p_subject_id: topic.kind === 'topic' ? topic.subjectId : null,
    p_classroom_id: topic.kind === 'class' ? topic.classroomId : null,
    p_months: months,
    p_granted: granted,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
  })
  return error ? error.message || 'Could not save the access.' : null
}

// A topic's name for people: "SCI · Year 5", or the class's own name.
export function topicLabel(
  topic: GrantTopic,
  subjectName: (id: number) => string | undefined,
  className: (id: number) => string | undefined,
) {
  return topic.kind === 'topic'
    ? `${subjectName(topic.subjectId) ?? 'A subject'} · ${topic.ageGroup}`
    : (className(topic.classroomId) ?? 'A class')
}
