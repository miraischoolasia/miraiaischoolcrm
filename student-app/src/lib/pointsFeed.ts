import { useEffect, useRef, useState } from 'react'

import { supabase } from './supabase'

// Points the teacher gives show at once: the app hears each new row of the
// child's student_points (the CRM's 20261024210000_student_live_feedback.sql
// lets an app login read its own child's rows, when the school shows points).

export type PointsBurst = { id: number; studentId: number; points: number; reason: string }

type PointsRow = { id: number; student_id: number; points: number; reason: string; reverses_id: number | null }

// Only points given (an undo or a redeem is not something to celebrate).
export function burstFromRow(row: Partial<PointsRow> | null | undefined): PointsBurst | null {
  if (!row || typeof row.id !== 'number' || typeof row.points !== 'number') return null
  if (row.points <= 0 || row.reverses_id != null) return null
  return { id: row.id, studentId: Number(row.student_id), points: row.points, reason: typeof row.reason === 'string' ? row.reason : '' }
}

export function usePointsBursts(studentId: number | null, enabled: boolean, onPoints: () => void) {
  const [queue, setQueue] = useState<PointsBurst[]>([])
  const onPointsRef = useRef(onPoints)
  useEffect(() => {
    onPointsRef.current = onPoints
  }, [onPoints])

  useEffect(() => {
    if (studentId === null || !enabled) return
    const channel = supabase
      .channel(`points-${studentId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'student_points', filter: `student_id=eq.${studentId}` },
        (change) => {
          const burst = burstFromRow(change.new as Partial<PointsRow>)
          onPointsRef.current()
          if (burst) setQueue((current) => [...current.slice(-4), burst])
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, studentId])

  // The first one in line (for the child picked now) is on screen; it leaves after a moment.
  const current = queue.find((burst) => burst.studentId === studentId) ?? null
  const done = () => setQueue((rest) => rest.filter((burst) => burst !== current))
  return { current, done }
}
