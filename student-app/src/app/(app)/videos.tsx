import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { formatDay } from '@/lib/format'
import { useSession } from '@/lib/session'
import { fetchClassVideos, monthLabel, videosByMonth, type ClassVideo, type ClassVideos } from '@/lib/videos'
import { Body, Button, Card, colors, Empty, Heading, Loading, Muted, Pill, Screen, Title } from '@/ui/kit'
import { VideoPlayer } from '@/ui/VideoPlayer'

// Videos: each class the child is in (a child can take several subjects), its
// videos by month, newest first, and the months the school has not opened yet.
export default function Videos() {
  const { child, branding } = useSession()
  const [classes, setClasses] = useState<ClassVideos[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [classId, setClassId] = useState<number | null>(null)
  const [playing, setPlaying] = useState<ClassVideo | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const studentId = child?.studentId ?? null

  const load = useCallback(async () => {
    if (studentId === null) return
    try {
      setClasses(await fetchClassVideos(studentId))
      setError(null)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not load the videos.')
    }
  }, [studentId])

  useEffect(() => {
    setClasses(null)
    setPlaying(null)
    void load()
  }, [load])

  if (studentId === null || (!classes && !error)) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }
  if (!classes) {
    return (
      <Screen>
        <Empty>{error}</Empty>
      </Screen>
    )
  }

  const current = classes.find((entry) => entry.classroom_id === classId) ?? classes[0] ?? null
  const months = current ? videosByMonth(current.videos) : []

  return (
    <Screen
      refreshing={isRefreshing}
      onRefresh={() => {
        setIsRefreshing(true)
        void load().finally(() => setIsRefreshing(false))
      }}
    >
      <Title>Videos</Title>
      {classes.length === 0 && <Empty>No class videos yet.</Empty>}

      {classes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {classes.map((entry) => {
            const active = entry.classroom_id === current?.classroom_id
            return (
              <Pressable
                key={entry.classroom_id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setClassId(entry.classroom_id)
                  setPlaying(null)
                }}
                style={[styles.chip, active ? { backgroundColor: branding.accentColor, borderColor: branding.accentColor } : null]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]}>
                  {entry.class} · {entry.videos.length}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {current && classes.length === 1 && <Muted>{current.class}</Muted>}

      {playing && (
        <Card>
          <Heading>{playing.title}</Heading>
          <VideoPlayer studentId={studentId} video={playing} onProgress={load} />
          {playing.description ? <Body>{playing.description}</Body> : null}
          <Button label="Close" variant="outline" color={branding.accentColor} onPress={() => setPlaying(null)} />
        </Card>
      )}

      {current && current.videos.length === 0 && current.closed_months.length === 0 && <Empty>No videos in this class yet.</Empty>}

      {months.map((group) => (
        <View key={`${group.year}-${group.month}`} style={styles.month}>
          <Heading>{monthLabel(group.year, group.month)}</Heading>
          {group.videos.map((video) => (
            <Pressable
              key={video.id}
              accessibilityRole="button"
              accessibilityLabel={`Play ${video.title}`}
              onPress={() => setPlaying(video)}
              style={({ pressed }) => [styles.video, pressed && styles.pressed, playing?.id === video.id && { borderColor: branding.accentColor }]}
            >
              <Text style={styles.play}>▶</Text>
              <View style={styles.videoText}>
                <Body style={styles.videoTitle}>{video.title}</Body>
                {video.lesson_date ? <Muted>{formatDay(video.lesson_date)}</Muted> : null}
              </View>
              <Progress video={video} />
            </Pressable>
          ))}
        </View>
      ))}

      {current && current.closed_months.length > 0 && (
        <Card>
          <Heading>Not open yet</Heading>
          <Muted>Ask the school to open these months for you.</Muted>
          {[...current.closed_months]
            .sort((a, b) => b.year - a.year || b.month - a.month)
            .map((entry) => (
              <Body key={`${entry.year}-${entry.month}`}>🔒 {monthLabel(entry.year, entry.month)}</Body>
            ))}
        </Card>
      )}
    </Screen>
  )
}

function Progress({ video }: { video: ClassVideo }) {
  if (video.completed) return <Pill color={colors.good} background={colors.goodBg}>Watched</Pill>
  if (video.watched > 0) return <Pill color={colors.warn} background={colors.warnBg}>{Math.round(video.watched)}%</Pill>
  return null
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 4 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 14, fontWeight: '700' },
  month: { gap: 8 },
  video: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 56,
  },
  pressed: { opacity: 0.7 },
  play: { fontSize: 18, color: colors.muted },
  videoText: { flex: 1, gap: 2 },
  videoTitle: { fontSize: 15, fontWeight: '600' },
})
