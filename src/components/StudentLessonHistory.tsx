import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'
import { fetchStudentLessonHistory, minutesBetween, participationTone, type LessonRecord } from '../lib/classEndReport'
import { supabase } from '../lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })

const toneClass = { red: 'text-rose-700 bg-rose-50', amber: 'text-amber-800 bg-amber-50', teal: 'text-teal-700 bg-teal-50', none: 'text-slate-500 bg-slate-100' } as const

type AnswerRow = { question_position: number; prompt: string; result: string; answer_text: string | null; answer_choices: number[] | null; options: { text: string }[] | null; points: number }

// The student page's Lessons tab: every class the child was in, newest first,
// with attendance, time in Zoom (and when they were out), answers and points;
// open one to see each question and the child's answer.
export function StudentLessonHistory({ studentId }: { studentId: number }) {
  const [records, setRecords] = useState<LessonRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [answers, setAnswers] = useState<Map<number, AnswerRow[]>>(new Map())

  useEffect(() => {
    let alive = true
    fetchStudentLessonHistory(studentId)
      .then((rows) => alive && setRecords(rows))
      .catch((problem: Error) => alive && setError(problem.message))
    return () => {
      alive = false
    }
  }, [studentId])

  async function toggle(sessionId: number) {
    setOpen(open === sessionId ? null : sessionId)
    if (answers.has(sessionId) || !supabase) return
    const { data } = await (supabase as unknown as SupabaseClient).rpc('lesson_student_answers', { p_session_id: sessionId, p_student_id: studentId })
    setAnswers((current) => new Map(current).set(sessionId, (data ?? []) as AnswerRow[]))
  }

  if (error) return <p className="text-sm text-rose-700">{error}</p>
  if (!records) return <p className="text-sm text-slate-500">Loading…</p>
  if (records.length === 0) return <p className="text-sm text-slate-500">No classes yet.</p>

  return (
    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
      {records.map((record) => {
        const tone = participationTone(record.participationPercent)
        const out = record.leftPeriods.filter((period) => period.kind === 'away')
        return (
          <li key={record.sessionId}>
            <button type="button" onClick={() => void toggle(record.sessionId)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50" aria-expanded={open === record.sessionId}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{dayOf(record.lessonFrom)}</p>
                <p className="truncate text-xs text-slate-500">
                  {timeOf(record.lessonFrom)} – {timeOf(record.lessonTo)}
                  {(record.lateMinutes ?? 0) >= 5 && ` · late ${record.lateMinutes} min`}
                  {(record.leftEarlyMinutes ?? 0) >= 5 && ` · left ${record.leftEarlyMinutes} min early`}
                  {out.length > 0 && ` · out ${out.map((period) => `${timeOf(period.from)}–${timeOf(period.to)} (${minutesBetween(period.from, period.to)} min)`).join(', ')}`}
                </p>
              </div>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', toneClass[tone])} title="Time in the lesson">
                {record.hasZoom ? `${record.zoomMinutes ?? 0} min · ${record.participationPercent ?? 0}%` : 'No Zoom'}
              </span>
              <span className="w-20 text-xs text-slate-600">
                {record.correct}/{record.questionsTotal} right
              </span>
              <span className="w-14 text-right text-sm font-semibold text-slate-900">{record.points} pts</span>
              <span
                className={cn(
                  'w-20 rounded-full px-2 py-0.5 text-center text-xs font-semibold',
                  record.attendanceStatus === 'present'
                    ? 'bg-emerald-50 text-emerald-700'
                    : record.attendanceStatus === 'absent'
                      ? 'bg-rose-50 text-rose-700'
                      : record.attendanceStatus === 'leave'
                        ? 'bg-sky-50 text-sky-700'
                        : 'bg-slate-100 text-slate-500',
                )}
              >
                {record.attendanceStatus ?? 'not taken'}
              </span>
            </button>
            {open === record.sessionId && (
              <ol className="space-y-1 bg-slate-50 px-4 py-2 text-xs text-slate-700">
                {!answers.has(record.sessionId) && <li>Loading…</li>}
                {answers.get(record.sessionId)?.length === 0 && <li>No questions in this class.</li>}
                {answers.get(record.sessionId)?.map((row) => (
                  <li key={row.question_position} className="flex gap-2">
                    <span className="font-semibold">Q{row.question_position}.</span>
                    <span className="min-w-0 flex-1 truncate">{row.prompt}</span>
                    <span className="max-w-[40%] truncate text-slate-500">
                      {row.answer_choices?.length ? row.answer_choices.map((index) => row.options?.[index]?.text ?? `#${index + 1}`).join(', ') : (row.answer_text ?? '')}
                    </span>
                    <span
                      className={cn(
                        'font-semibold',
                        row.result === 'correct' ? 'text-emerald-700' : row.result === 'wrong' ? 'text-rose-700' : row.result === 'pending' ? 'text-amber-700' : 'text-slate-400',
                      )}
                    >
                      {row.result === 'unanswered' ? 'no answer' : row.result}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </li>
        )
      })}
    </ul>
  )
}
