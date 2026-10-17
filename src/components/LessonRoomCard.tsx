import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { UsersThree, Warning } from '@phosphor-icons/react'
import { buildRoom, clearStranger, fetchRoom, watchRoom, type RoomData } from '../lib/zoomRoom'

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })

// Who is in the lesson's Zoom meeting right now, live from Zoom: who to Admit
// from the waiting room, who came late or dropped out, who has not come, and
// anyone who joined without a child's own link.
export function LessonRoomCard({ sessionId }: { sessionId: number }) {
  const [data, setData] = useState<RoomData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchRoom(sessionId)
      .then((next) => {
        setData(next)
        setError(null)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not read who is in the lesson.'))
  }, [sessionId])

  useEffect(() => {
    load()
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = watchRoom(sessionId, () => {
      clearTimeout(timer)
      timer = setTimeout(load, 300)
    })
    const poll = setInterval(load, 30000)
    return () => {
      stop()
      clearTimeout(timer)
      clearInterval(poll)
    }
  }, [load, sessionId])

  const room = useMemo(() => (data ? buildRoom(data) : null), [data])

  async function clear(id: number) {
    const problem = await clearStranger(id)
    setError(problem)
    load()
  }

  return (
    <section aria-label="Who is here" className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UsersThree size={18} className="text-emerald-600" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-900">Who is here</h3>
        </div>
        {room && (
          <span className="text-sm text-slate-600">
            <strong className="text-slate-900">{room.here.length}</strong> of {room.here.length + room.left.length + room.notYet.length} in Zoom
            {room.hostHere ? ' · you are in' : ''}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!room ? (
        !error && <p className="mt-1 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          {room.strangers.map((stranger) => (
            <div key={stranger.id} role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2 text-rose-800">
              <span className="flex items-center gap-2">
                <Warning size={16} aria-hidden="true" />
                <span>
                  <strong>{stranger.name}</strong> joined Zoom at {timeOf(stranger.joinedAt)} without a child's own link.
                  {stranger.stillHere ? ' Remove them in Zoom if you do not know them.' : ' They have left.'}
                </span>
              </span>
              <button type="button" onClick={() => void clear(stranger.id)} className="text-xs font-semibold underline underline-offset-2">
                OK
              </button>
            </div>
          ))}
          {room.waiting.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
              <p className="font-semibold">Waiting room ({room.waiting.length}) · Admit them in Zoom</p>
              <p className="mt-0.5">{room.waiting.map((row) => `${row.name} (${timeOf(row.enteredAt)})`).join(', ')}</p>
            </div>
          )}
          <RoomList title="In the lesson" tone="text-emerald-700" empty="Nobody yet.">
            {room.here.map((child) => (
              <li key={child.studentId}>
                {child.name}
                <span className="text-slate-500"> · {child.firstJoinedAt ? timeOf(child.firstJoinedAt) : ''}</span>
                {child.late && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">late</span>}
              </li>
            ))}
          </RoomList>
          {room.left.length > 0 && (
            <RoomList title="Left" tone="text-slate-700" empty="">
              {room.left.map((child) => (
                <li key={child.studentId}>
                  {child.name}
                  <span className="text-slate-500">
                    {' '}
                    · {child.lastLeftAt ? timeOf(child.lastLeftAt) : ''}
                    {child.dropped ? ' (connection dropped)' : ''}
                  </span>
                </li>
              ))}
            </RoomList>
          )}
          {room.notYet.length > 0 && (
            <RoomList title="Not here yet" tone="text-rose-700" empty="">
              {room.notYet.map((child) => (
                <li key={child.studentId}>{child.name}</li>
              ))}
            </RoomList>
          )}
        </div>
      )}
    </section>
  )
}

function RoomList({ title, tone, empty, children }: { title: string; tone: string; empty: string; children: ReactNode[] }) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {title} ({children.length})
      </p>
      {children.length === 0 ? <p className="text-slate-500">{empty}</p> : <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-slate-800">{children}</ul>}
    </div>
  )
}
