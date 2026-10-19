import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchJoinInfo, useClassLive } from '@/lib/classRoom'
import { LiveProvider } from '@/lib/live'
import { usePointsBursts } from '@/lib/pointsFeed'
import { useSession } from '@/lib/session'
import { ClassBar, ClassMoments } from '@/ui/ClassEffects'
import { Button, Card, colors, Heading, Muted } from '@/ui/kit'
import { findSessionSummary, LessonSummaryChips, useLessonSummaries } from '@/ui/LessonSummary'
import { LessonNotesList, useLessonNotes } from '@/ui/LessonNotes'
import { LiveQuestionCard } from '@/ui/LiveQuestionCard'
import { PointsBurstView } from '@/ui/PointsBurst'
import { ZoomRoom } from '@/ui/ZoomRoom'

// /class/<session id>: the lesson inside the app. Zoom fills the page; the
// teacher's questions sit beside it (under it on a phone), and the teacher's
// moments (random pick, star of the day, cheers, timer, teams) come live from
// the console. Questions are read for this lesson only, with a check every
// minute as a fallback; the teacher's published notes for this lesson too.
// When the video ends (the teacher ends the class, or the child leaves) the
// page shows the lesson's summary and notes.
export default function ClassPage() {
  const params = useLocalSearchParams<{ sessionId: string }>()
  const sessionId = Number(params.sessionId)
  const valid = Number.isInteger(sessionId) && sessionId > 0
  const { child, branding, home } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const wide = width >= 900
  const studentId = child?.studentId ?? null
  const live = useClassLive(valid ? sessionId : null)
  // Points the child gets pop up at once; nothing else reloads during class.
  const bursts = usePointsBursts(studentId, Boolean(home?.sees.points), () => undefined)
  // Out of the video: the summary and notes of this lesson, read again then.
  const [left, setLeft] = useState(0)
  const [showOver, setShowOver] = useState(false)
  const [minute, setMinute] = useState(0)
  useEffect(() => {
    const tick = setInterval(() => setMinute((value) => value + 1), 60_000)
    return () => clearInterval(tick)
  }, [])
  const notes = useLessonNotes(studentId, `${minute}-${left}`).filter((note) => note.session_id === sessionId)
  const summaries = useLessonSummaries(studentId, left)
  const summary = findSessionSummary(summaries, sessionId)
  const getJoinInfo = useCallback(() => {
    if (!studentId) return Promise.reject(new Error('Pick a child first.'))
    return fetchJoinInfo(sessionId, studentId)
  }, [sessionId, studentId])

  function back() {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  if (!valid) {
    return (
      <View style={[styles.page, { paddingTop: insets.top + 16 }]}>
        <Muted>This class link is not right.</Muted>
      </View>
    )
  }

  return (
    <LiveProvider sessionId={sessionId}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" onPress={back} style={styles.back}>
            <Text style={styles.backText}>← Leave</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {live.state?.title || child?.name || 'Class'}
          </Text>
          <View style={[styles.dot, { backgroundColor: live.connected ? colors.good : colors.muted }]} accessibilityLabel={live.connected ? 'Live' : 'Connecting'} />
        </View>
        <View style={[styles.body, wide && styles.bodyWide]}>
          <View style={[styles.video, wide ? styles.videoWide : styles.videoNarrow]}>
            <ZoomRoom
              getJoinInfo={getJoinInfo}
              color={branding.accentColor}
              onLeft={() => {
                setLeft((value) => value + 1)
                setShowOver(true)
              }}
            />
            {showOver && (
              <View style={styles.over}>
                <Card style={{ gap: 10, width: '100%', maxWidth: 420 }}>
                  <Heading>The class video has ended</Heading>
                  <Muted>If your teacher ended the class, see you next time! If you left by mistake, join again.</Muted>
                  {summary && <LessonSummaryChips summary={summary} color={branding.accentColor} />}
                  <LessonNotesList notes={notes} color={branding.accentColor} />
                  <Button label="Back to Home" color={branding.accentColor} onPress={back} />
                  <Button label="Join again" variant="outline" color={branding.accentColor} onPress={() => setShowOver(false)} />
                </Card>
              </View>
            )}
          </View>
          <View style={wide ? styles.sideWide : styles.sideNarrow}>
            <ClassBar state={live.state} clockOffset={live.clockOffset} myId={studentId ?? 0} color={branding.accentColor} />
            <ScrollView contentContainerStyle={[styles.side, { paddingBottom: insets.bottom + 16 }]}>
              <LiveQuestionCard color={branding.accentColor} />
              <Muted style={{ textAlign: 'center' }}>Your teacher&apos;s questions show here.</Muted>
              {notes.length > 0 && (
                <Card style={{ gap: 8 }}>
                  <Heading>Lesson notes</Heading>
                  <LessonNotesList notes={notes} color={branding.accentColor} />
                </Card>
              )}
            </ScrollView>
          </View>
        </View>
        <ClassMoments state={live.state} clockOffset={live.clockOffset} myId={studentId ?? 0} />
        {bursts.current && <PointsBurstView burst={bursts.current} color={branding.accentColor} onDone={bursts.done} />}
      </View>
    </LiveProvider>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f1229' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 52 },
  back: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  video: { position: 'relative', backgroundColor: '#141833' },
  videoWide: { flex: 1 },
  videoNarrow: { height: '58%' },
  sideWide: { width: 380, backgroundColor: colors.background },
  sideNarrow: { flex: 1, backgroundColor: colors.background },
  side: { padding: 12, gap: 12 },
  over: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(15,18,41,0.92)' },
})
