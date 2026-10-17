import { lessonBoard, type LiveAnswer, type LiveQuestion } from './liveQuestions'
import { buildRoom, type RoomData } from './zoomRoom'
import type { ZoomMinutes } from './zoomLessons'

// One lesson on one page: how each question went, and for each child their
// time in Zoom (late, dropped out), points and every answer.

export type ReportQuestion = {
  id: number
  number: number
  prompt: string
  answered: number
  right: number
  toMark: number
  // Of the children marked, how many were right (null while none is marked).
  rightPercent: number | null
  averageSeconds: number | null
}

export type ReportChild = {
  studentId: number
  name: string
  zoomMinutes: number | null
  countsAsPresent: boolean | null
  firstJoinedAt: string | null
  late: boolean
  droppedOut: boolean
  points: number
  place: number | null
  right: number
  answered: number
  answers: { questionId: number; number: number; result: LiveAnswer['result']; points: number; secondsTaken: number }[]
}

export type LessonReport = {
  questions: ReportQuestion[]
  children: ReportChild[]
  inZoom: number
  rosterSize: number
  rightPercent: number | null
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null)

export function buildLessonReport(input: {
  questions: LiveQuestion[]
  answers: LiveAnswer[]
  room: RoomData
  minutes: ZoomMinutes[]
}): LessonReport {
  const { questions, answers, room, minutes } = input
  const numbers = new Map(questions.map((question) => [question.id, question.number]))

  const reportQuestions = [...questions]
    .sort((a, b) => a.number - b.number)
    .map((question) => {
      const own = answers.filter((answer) => answer.liveQuestionId === question.id)
      const right = own.filter((answer) => answer.result === 'correct').length
      const marked = own.filter((answer) => answer.result !== 'pending').length
      return {
        id: question.id,
        number: question.number,
        prompt: question.prompt,
        answered: own.length,
        right,
        toMark: own.length - marked,
        rightPercent: percent(right, marked),
        averageSeconds: own.length > 0 ? Math.round(own.reduce((sum, answer) => sum + answer.secondsTaken, 0) / own.length) : null,
      }
    })

  const places = new Map(lessonBoard(answers).map((row) => [row.studentId, row]))
  const minutesBy = new Map(minutes.map((row) => [row.studentId, row]))
  const people = buildRoom(room)
  const zoomPeople = new Map([...people.here, ...people.left, ...people.notYet].map((child) => [child.studentId, child]))
  const names = new Map(room.roster.map((child) => [child.studentId, child.name]))
  const ids = new Set([...room.roster.map((child) => child.studentId), ...answers.map((answer) => answer.studentId), ...zoomPeople.keys()])

  const children: ReportChild[] = [...ids].map((studentId) => {
    const zoom = zoomPeople.get(studentId)
    const board = places.get(studentId)
    const time = minutesBy.get(studentId)
    const stays = room.stays.filter((stay) => stay.studentId === studentId)
    return {
      studentId,
      name: names.get(studentId) ?? zoom?.name ?? `Student ${studentId}`,
      zoomMinutes: time?.minutes ?? null,
      countsAsPresent: time?.countsAsPresent ?? null,
      firstJoinedAt: zoom?.firstJoinedAt ?? null,
      late: zoom?.late ?? false,
      droppedOut: stays.some((stay) => stay.dropped),
      points: board?.points ?? 0,
      place: board?.place ?? null,
      right: board?.right ?? 0,
      answered: board?.answered ?? 0,
      answers: answers
        .filter((answer) => answer.studentId === studentId)
        .map((answer) => ({
          questionId: answer.liveQuestionId,
          number: numbers.get(answer.liveQuestionId) ?? 0,
          result: answer.result,
          points: answer.points,
          secondsTaken: answer.secondsTaken,
        }))
        .sort((a, b) => a.number - b.number),
    }
  })
  children.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))

  const marked = answers.filter((answer) => answer.result !== 'pending')
  return {
    questions: reportQuestions,
    children,
    inZoom: children.filter((child) => child.firstJoinedAt !== null).length,
    rosterSize: room.roster.length,
    rightPercent: percent(marked.filter((answer) => answer.result === 'correct').length, marked.length),
  }
}
