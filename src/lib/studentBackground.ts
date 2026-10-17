import type { LessonLogStudentReview, LessonLogSummary } from '../types/domain'

// What the teacher should know about a child during class: lessons left, a
// package running out, and what was written about them last time. Staff
// only (the console); never shown to the child or parent.

export type StudentBackground = {
  lessonsLeft: number | null
  lowOnLessons: boolean
  expiresOn: string | null
  expiringSoon: boolean
  lastRemark: string | null
  lastRemarkDate: string | null
}

const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export function studentBackgrounds(input: {
  // hasPackage: on a package now (a trial / HOA / camp child has no lessons to count).
  students: { id: number; remainingHours: number | null; lessonExpiryDate: string | null; hasPackage: boolean }[]
  logs: Pick<LessonLogSummary, 'id' | 'lessonDate' | 'submittedAt'>[]
  reviews: Pick<LessonLogStudentReview, 'lessonLogId' | 'studentId' | 'lessonRemark'>[]
  today: string
  lowAt?: number
  soonDays?: number
}): Map<number, StudentBackground> {
  const { students, logs, reviews, today, lowAt = 2, soonDays = 30 } = input
  const logById = new Map(logs.map((log) => [log.id, log]))
  const last = new Map<number, { remark: string; date: string; submittedAt: string }>()
  for (const review of reviews) {
    const remark = review.lessonRemark?.trim()
    const log = logById.get(review.lessonLogId)
    if (!remark || !log || log.lessonDate >= today) continue
    const current = last.get(review.studentId)
    if (!current || log.lessonDate > current.date || (log.lessonDate === current.date && log.submittedAt > current.submittedAt)) {
      last.set(review.studentId, { remark, date: log.lessonDate, submittedAt: log.submittedAt })
    }
  }
  const soon = addDays(today, soonDays)
  return new Map(
    students.map((student) => {
      const left = student.hasPackage && typeof student.remainingHours === 'number' ? student.remainingHours : null
      const expires = student.hasPackage ? student.lessonExpiryDate || null : null
      const previous = last.get(student.id)
      return [
        student.id,
        {
          lessonsLeft: left,
          lowOnLessons: left !== null && left <= lowAt,
          expiresOn: expires,
          expiringSoon: expires !== null && expires >= today && expires <= soon,
          lastRemark: previous?.remark ?? null,
          lastRemarkDate: previous?.date ?? null,
        },
      ]
    }),
  )
}
