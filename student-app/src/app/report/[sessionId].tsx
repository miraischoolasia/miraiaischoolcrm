import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'

import { todayInMalaysia } from '@/lib/format'
import { englishReportWords, fetchLessonReport, markReportSeen, nextLessonOf, type LessonReport } from '@/lib/lessonReport'
import { lobbyThemes } from '@/lib/lobbyThemes'
import { useSession } from '@/lib/session'
import { Button, Empty, Loading, Screen } from '@/ui/kit'
import { LessonEndReport } from '@/ui/LessonEndReport'

// /report/<session id>: the child's report of a lesson the teacher has ended
// (ui/LessonEndReport.tsx). Opening it counts as seen, so the app does not
// open it by itself again (until the teacher sends the attendance).
export default function ReportPage() {
  const params = useLocalSearchParams<{ sessionId: string }>()
  const sessionId = Number(params.sessionId)
  const router = useRouter()
  const { child, branding, home } = useSession()
  const [report, setReport] = useState<LessonReport | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const studentId = child?.studentId ?? null

  useEffect(() => {
    if (studentId === null || !Number.isFinite(sessionId)) return
    let alive = true
    fetchLessonReport(studentId, sessionId)
      .then((found) => {
        if (!alive) return
        setReport(found)
        if (found) void markReportSeen(studentId, sessionId)
      })
      .catch((problem: Error) => alive && setError(problem.message))
    return () => {
      alive = false
    }
  }, [sessionId, studentId])

  const theme = branding.homeStyle === 'lobby' ? lobbyThemes[branding.homeTheme] : undefined
  const words = theme?.report ?? englishReportWords
  const background = null
  const home$ = () => (router.canGoBack() ? router.back() : router.replace('/'))

  if (report === undefined && !error) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }
  if (!report) {
    return (
      <Screen>
        <Empty>{error ?? 'The report is ready once your teacher ends the class.'}</Empty>
        <Button label={words.home} color={branding.accentColor} onPress={() => router.replace('/')} />
      </Screen>
    )
  }
  return (
    <LessonEndReport
      report={report}
      childName={(child?.name ?? '').split(' ')[0]}
      words={words}
      color={branding.accentColor}
      background={background}
      next={nextLessonOf(report, home?.schedule)}
      today={todayInMalaysia()}
      onHome={home$}
      onQuestions={report.classroom_id ? () => router.replace(`/videos?class=${report.classroom_id}&tab=questions` as Href) : null}
      onVideos={() => router.replace((report.classroom_id ? `/videos?class=${report.classroom_id}` : '/videos') as Href)}
    />
  )
}
