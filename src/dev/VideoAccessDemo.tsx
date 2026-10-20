import { useEffect, useState } from 'react'
import { VideoGrantsGrid, type VideoGrantsApi } from '../components/videos/VideoGrantsGrid'
import { BulkVideoGrantsModal } from '../components/videos/BulkVideoGrantsModal'
import { AgeGroupsContext } from '../lib/ageGroups'
import { topicKey, type VideoGrant } from '../lib/videoGrants'
import type { Classroom, Student } from '../types/domain'

// Only the dev server shows this (/?demo=videoaccess): the recordings access grid of one made-up
// student and the many-students window, saving into the page only (no network).

const AGES = ['Year 3', 'Year 4', 'Year 5', 'Year 6']
const subjects = [
  { id: 13, name: 'SCI', sortOrder: 10, isActive: true },
  { id: 1, name: 'MM', sortOrder: 20, isActive: true },
]
const room = (id: number, name: string, ageGroup: string, subjectId: number | null) =>
  ({ id, name, ageGroup, subjectId, status: 'active', category: 'regular' }) as Classroom
const classrooms = [
  room(1, 'SCI Year 5 · Ms Joey', 'Year 5', 13),
  room(2, 'MM Year 5 · Mr Danny', 'Year 5', 1),
  room(3, 'AI学习 Year 5', 'Year 5', null),
]
const students = ['Ali', 'Siti', 'Mei', 'Kumar'].map(
  (name, index) => ({ id: index + 1, name, isActive: true, classroomId: 1, classPeriods: [{ classroomId: 1, startDate: null, endDate: null }] }) as unknown as Student,
)

let grants: VideoGrant[] = [
  { id: 1, studentId: 1, year: 2026, month: 10, startsOn: null, endsOn: null, topic: { kind: 'topic', ageGroup: 'Year 5', subjectId: 13 } },
  { id: 2, studentId: 1, year: 2026, month: 8, startsOn: null, endsOn: '2026-09-30', topic: { kind: 'topic', ageGroup: 'Year 5', subjectId: 1 } },
]
let nextId = 3
const listeners = new Set<() => void>()

const save: VideoGrantsApi['setGrants'] = async ({ studentIds, topic, months, granted }) => {
  for (const studentId of studentIds) {
    for (const { year, month } of months) {
      grants = grants.filter(
        (grant) => !(grant.studentId === studentId && topicKey(grant.topic) === topicKey(topic) && grant.year === year && grant.month === month),
      )
      if (granted) grants.push({ id: nextId++, studentId, year, month, startsOn: null, endsOn: null, topic })
    }
  }
  listeners.forEach((listener) => listener())
  return null
}

const api: VideoGrantsApi = {
  fetchGrants: async (studentId) => grants.filter((grant) => grant.studentId === studentId),
  canGrant: async () => true,
  setGrants: save,
  fetchSubjects: async () => subjects,
  fetchNoSubjectClasses: async () => [{ id: 3, name: 'AI学习 Year 5' }],
}

export function VideoAccessDemo() {
  const [bulk, setBulk] = useState(false)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const listener = () => setVersion((count) => count + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return (
    <AgeGroupsContext.Provider value={AGES}>
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <h1 className="text-lg font-semibold text-slate-900">Ali · Videos</h1>
        <VideoGrantsGrid key={version} studentId={1} classrooms={classrooms.slice(0, 2)} api={api} />
        <button type="button" onClick={() => setBulk(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-semibold">
          Open months for many students
        </button>
        <pre aria-label="Saved grants" className="rounded bg-slate-900 p-2 text-xs text-white">
          {grants.map((grant) => `${grant.studentId} ${topicKey(grant.topic)} ${grant.year}-${grant.month}${grant.endsOn ? ` ends ${grant.endsOn}` : ''}`).join('\n')}
        </pre>
      </div>
      {bulk && (
        <BulkVideoGrantsModal
          classrooms={classrooms}
          students={students}
          subjects={subjects}
          ageGroups={AGES}
          onClose={() => setBulk(false)}
          onDone={() => setVersion((count) => count + 1)}
          save={save}
        />
      )}
    </AgeGroupsContext.Provider>
  )
}
